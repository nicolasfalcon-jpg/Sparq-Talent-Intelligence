/**
 * Deterministic ids for the FICTIONAL database seed. Every persistent entity has a uuid; the seed derives it (UUID v5) from the
 * entity's kind and its fixture id, so the same fixture row always gets the same uuid on every run and in every test, and no
 * random ids are ever committed. Pure: no I/O. Server/build tooling only.
 */
import { createHash } from "node:crypto";

/** Fixed namespace for Sparq's fictional seed. Changing it changes every seeded id. */
export const SEED_NAMESPACE = "6f1c2c4e-5b1d-4c7e-9a6b-3d2f0e8a7b11";

export function uuidV5(name: string, namespace: string = SEED_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const seedId = (kind: "person" | "capability" | "evidence" | "project" | "opportunity" | "role" | "seat" | "proposal" | "assignment" | "interest" | "user", key: string): string =>
  uuidV5(`${kind}:${key}`);

export type SeedRole = "engineer" | "staffing_lead" | "delivery_lead" | "admin";

/**
 * Fictional authenticated identities. The two domain personas (Laura, Ana) come from the app fixtures; the others exist so the
 * database can be exercised end to end: another engineer (cross-profile isolation), two delivery leads (project-level scope),
 * and an administrator. ONE ROLE PER ACCOUNT (the database still supports several roles per user: tests that need an engineer who
 * is also a delivery lead grant the role explicitly). The auth.users rows are created by scripts/db/provision.mjs (Supabase Auth) or,
 * for disposable PGlite databases, by tests/db/harness.ts; supabase/seed.sql assumes they exist.
 */
export const SEED_USERS = [
  { key: "laura", name: "Laura Gómez", title: "Staffing Lead", roles: ["staffing_lead"], person: null },
  { key: "ana", name: "Ana Ruiz", title: "Senior Mobile Engineer", roles: ["engineer"], person: "ana" },
  { key: "lucia", name: "Lucía Fernández", title: "AI Engineer", roles: ["engineer"], person: "lucia" },
  { key: "rafael", name: "Rafael Ortiz", title: "Delivery Lead", roles: ["delivery_lead"], person: null },
  { key: "ines", name: "Inés Vidal", title: "Delivery Lead", roles: ["delivery_lead"], person: null },
  { key: "camila", name: "Camila Duarte", title: "QA Automation Lead", roles: ["engineer"], person: "camila" },
  { key: "admin", name: "Admin Demo", title: "Administrator", roles: ["admin"], person: null },
] as const satisfies readonly { key: string; name: string; title: string; roles: readonly SeedRole[]; person: string | null }[];

export type SeedUserKey = (typeof SEED_USERS)[number]["key"];
export const userId = (key: SeedUserKey): string => seedId("user", key);
/** Convenience map for tests: U.laura, U.ana … */
export const U = Object.fromEntries(SEED_USERS.map((u) => [u.key, seedId("user", u.key)])) as Record<SeedUserKey, string>;
