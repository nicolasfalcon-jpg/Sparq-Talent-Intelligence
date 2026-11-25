import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/domain/errors";
import { ASSISTANT_CONTEXTS, assertAllowed, authorize, canUseAssistantContext, type Actor, type Permission } from "@/domain/policy";
import { AssistantContext } from "@/domain/schemas";

const staff: Actor = { id: "u-laura", role: "staffing_lead", personId: null };
const ana: Actor = { id: "u-ana", role: "engineer", personId: "ana" };
const rafael: Actor = { id: "u-rafael", role: "delivery_lead", personId: null };
const admin: Actor = { id: "u-admin", role: "admin", personId: null };

describe("authorization policy (one place decides who may do what)", () => {
  const cases: [Permission, { personId?: string }, Actor, boolean][] = [
    ["workspace:staff", {}, staff, true], ["workspace:staff", {}, ana, false],
    ["workspace:personal", {}, ana, true], ["workspace:personal", {}, staff, false],
    ["people:list", {}, staff, true], ["people:list", {}, ana, false],
    ["opportunities:read", {}, staff, true], ["opportunities:read", {}, ana, false],
    ["shortlist:edit", {}, staff, true], ["shortlist:edit", {}, ana, false],
    // Reading a passport: staff read any, a person reads only their own.
    ["passport:read", { personId: "lucia" }, staff, true],
    ["passport:read", { personId: "ana" }, ana, true],
    ["passport:read", { personId: "lucia" }, ana, false],
    ["passport:read", {}, ana, false],
    // Editing a passport is owner-only: a staffing lead can never do it, a person can only edit their own.
    ["passport:edit", { personId: "ana" }, ana, true],
    ["passport:edit", { personId: "lucia" }, ana, false],
    ["passport:edit", { personId: "ana" }, staff, false],
    ["passport:edit", { personId: "lucia" }, staff, false],
    // Private interests: the owner only. Staffing leads are not an exception.
    ["interests:read-private", { personId: "ana" }, ana, true],
    ["interests:read-private", { personId: "ana" }, staff, false],
    ["interests:read-private", { personId: "lucia" }, ana, false],
    ["assistant:ask", {}, staff, true], ["assistant:ask", {}, ana, true],
    // Four roles. A role is only the first gate: the database also requires the relationship (leading THAT opportunity…).
    ["workspace:staff", {}, rafael, true], ["workspace:staff", {}, admin, false],
    ["workspace:admin", {}, admin, true], ["workspace:admin", {}, staff, false], ["workspace:admin", {}, rafael, false], ["workspace:admin", {}, ana, false],
    ["people:list", {}, rafael, false], ["people:list", {}, admin, false],
    ["shortlist:edit", {}, rafael, false],
    ["opportunities:read", {}, rafael, true], ["opportunities:read", {}, admin, false],
    ["opportunities:read-published", {}, ana, true], ["opportunities:read-published", {}, staff, false], ["opportunities:read-published", {}, rafael, false],
    ["proposals:read", {}, staff, true], ["proposals:read", {}, rafael, true], ["proposals:read", {}, ana, false], ["proposals:read", {}, admin, false],
    ["proposals:write", {}, staff, true], ["proposals:write", {}, rafael, false], ["proposals:write", {}, ana, false], ["proposals:write", {}, admin, false],
    ["proposals:review", {}, rafael, true], ["proposals:review", {}, staff, false], ["proposals:review", {}, ana, false], ["proposals:review", {}, admin, false],
    ["assignments:confirm", {}, rafael, true], ["assignments:confirm", {}, staff, false], ["assignments:confirm", {}, admin, false], ["assignments:confirm", {}, ana, false],
    ["planning:read", {}, staff, true], ["planning:read", {}, rafael, false], ["planning:read", {}, ana, false], ["planning:read", {}, admin, false],
    ["insights:read", {}, staff, true], ["insights:read", {}, rafael, false], ["insights:read", {}, ana, false],
    ["interest:express", { personId: "ana" }, ana, true], ["interest:express", { personId: "lucia" }, ana, false], ["interest:express", { personId: "ana" }, staff, false],
    ["passport:read", { personId: "ana" }, rafael, false], ["passport:read", { personId: "ana" }, admin, false],
    ["passport:edit", { personId: "ana" }, admin, false],
    ["interests:read-private", { personId: "ana" }, admin, false], ["interests:read-private", { personId: "ana" }, rafael, false],
    ["assistant:ask", {}, rafael, true], ["assistant:ask", {}, admin, false],
  ];
  it.each(cases)("%s %j as %s → %s", (permission, resource, actor, expected) => {
    expect(authorize(actor, permission, resource).allowed).toBe(expected);
  });

  it("explains a denial, and assertAllowed turns it into a typed ForbiddenError", () => {
    const d = authorize(ana, "people:list");
    expect(d).toEqual({ allowed: false, reason: expect.stringMatching(/staffing leads/i) });
    expect(() => assertAllowed(ana, "people:list")).toThrow(ForbiddenError);
    expect(() => assertAllowed(staff, "people:list")).not.toThrow();
  });

  it("an engineer without a linked profile owns nothing", () => {
    const orphan: Actor = { id: "u-x", role: "engineer", personId: null };
    expect(authorize(orphan, "passport:edit", { personId: "ana" }).allowed).toBe(false);
    expect(authorize(orphan, "passport:read", { personId: "ana" }).allowed).toBe(false);
  });
});

describe("assistant contexts are role-scoped, and a context never widens access", () => {
  it("delivery leads and administrators have no assistant context yet (nothing is widened by default)", () => {
    expect(ASSISTANT_CONTEXTS.delivery_lead).toEqual([]);
    expect(ASSISTANT_CONTEXTS.admin).toEqual([]);
    for (const c of AssistantContext.options) { expect(canUseAssistantContext(rafael, c)).toBe(false); expect(canUseAssistantContext(admin, c)).toBe(false); }
  });
  it("staff and personal contexts do not overlap, and together cover every context", () => {
    const all = AssistantContext.options;
    const staffCtx = ASSISTANT_CONTEXTS.staffing_lead, engCtx = ASSISTANT_CONTEXTS.engineer;
    expect(staffCtx.filter((c) => engCtx.includes(c))).toEqual([]);
    expect([...staffCtx, ...engCtx].sort()).toEqual([...all].sort());
  });
  it("an engineer can only use 'me' and 'mypassport'; staff cannot use the personal contexts", () => {
    expect(AssistantContext.options.filter((c) => canUseAssistantContext(ana, c)).sort()).toEqual(["me", "mypassport"]);
    expect(canUseAssistantContext(staff, "me")).toBe(false);
    expect(canUseAssistantContext(staff, "mypassport")).toBe(false);
    expect(canUseAssistantContext(staff, "passport")).toBe(true);
  });
});
