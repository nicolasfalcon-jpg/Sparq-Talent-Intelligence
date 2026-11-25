import { redirect } from "next/navigation";
import { DisplayTitle } from "@/design-system/primitives";
import { SparkGlyph } from "@/design-system/icons";
import { assertAllowed } from "@/domain/policy";
import { ForbiddenError } from "@/domain/errors";
import { homeFor } from "@/lib/access";
import { getSessionUser } from "@/lib/session";

export const metadata = { title: "Administration" };

/**
 * Minimal administrator landing page. There is no admin management interface: roles, profile links and delivery-lead assignments
 * are administered with the audited SQL functions (see docs/handoff/08). Administrators have no staffing powers and see no
 * people, evidence, interests or proposals.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  try { assertAllowed(user, "workspace:admin"); } catch (e) { if (e instanceof ForbiddenError) redirect(homeFor(user)); throw e; }
  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-10 pt-6 pb-[120px] max-xl:px-5">
      <DisplayTitle light="Administration," strong="by script." />
      <section className="flex max-w-[760px] flex-col gap-4 rounded-surface p-8" style={{ background: "var(--gradient-ai-soft)" }}>
        <span className="inline-flex items-center gap-3"><span className="inline-flex size-[30px] items-center justify-center rounded-full bg-coral"><SparkGlyph size={14} /></span><span className="font-medium">Signed in as {user.name}</span></span>
        <p className="text-lg leading-[1.45] font-light">There is no administration interface in this release. Roles, profile links and delivery-lead assignments are managed with audited database functions, and every change is recorded.</p>
        <p className="text-sm text-mute">Administrators do not have access to people, evidence, career interests or staffing proposals.</p>
      </section>
    </main>
  );
}
