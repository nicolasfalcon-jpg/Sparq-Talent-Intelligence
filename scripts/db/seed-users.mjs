// The controlled DEMO accounts, shared by the provisioning script, the migration runner's checks and the PGlite test helper.
// Plain ESM (no TypeScript) so Node scripts can import it. It DUPLICATES the uuid derivation of src/data/seed/ids.ts on purpose
// (scripts must not import the app's TypeScript); tests/db/provision.test.ts proves the two stay identical.
import { createHash } from "node:crypto";

export const SEED_NAMESPACE = "6f1c2c4e-5b1d-4c7e-9a6b-3d2f0e8a7b11";

export function uuidV5(name, namespace = SEED_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const userId = (key) => uuidV5(`user:${key}`);

/** One role per account. Fictional people only; no real addresses (the reserved example TLD never receives mail). */
export const DEMO_USERS = [
  { key: "laura", name: "Laura Gómez", title: "Staffing Lead", roles: ["staffing_lead"] },
  { key: "ana", name: "Ana Ruiz", title: "Senior Mobile Engineer", roles: ["engineer"] },
  { key: "lucia", name: "Lucía Fernández", title: "AI Engineer", roles: ["engineer"] },
  { key: "rafael", name: "Rafael Ortiz", title: "Delivery Lead", roles: ["delivery_lead"] },
  { key: "ines", name: "Inés Vidal", title: "Delivery Lead", roles: ["delivery_lead"] },
  { key: "camila", name: "Camila Duarte", title: "QA Automation Lead", roles: ["engineer"] },
  { key: "admin", name: "Admin Demo", title: "Administrator", roles: ["admin"] },
];

export const demoEmail = (key) => `${key}@sparq-demo.example`;

/** SQL that stands in for GoTrue in a disposable PGlite database ONLY (never run against Supabase). */
export const demoAuthUsersSql = () =>
  `insert into auth.users (id, email) values\n${DEMO_USERS.map((u) => `  ('${userId(u.key)}', '${demoEmail(u.key)}')`).join(",\n")}\non conflict do nothing;\n`;
