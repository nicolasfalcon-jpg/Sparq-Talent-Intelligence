/**
 * The domain identifies people, capabilities, opportunities and roles by SLUG; the database by uuid. Reads mostly embed the
 * slug in the same query (`person:people(slug)`); writes resolve slugs here. The cache is keyed by the request's client (a
 * WeakMap), so it lives for one request and can never leak identifiers between users.
 */
import { NotFoundError } from "@/domain/errors";
import { rows, type Db } from "./db";

export type SlugTable = "people" | "capabilities" | "opportunities" | "role_requirements";

const cache = new WeakMap<Db, Map<string, string>>();
const store = (db: Db) => { let m = cache.get(db); if (!m) { m = new Map(); cache.set(db, m); } return m; };

/** slug → uuid for each slug, in one query per table. Slugs that cannot be read (or do not exist) are absent from the result. */
export async function resolveSlugs(db: Db, table: SlugTable, slugs: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const memo = store(db);
  const missing: string[] = [];
  for (const s of new Set(slugs)) {
    const hit = memo.get(`${table}:${s}`);
    if (hit) out.set(s, hit); else missing.push(s);
  }
  if (missing.length) {
    for (const r of await rows(db.from(table).select("id, slug").in("slug", missing))) {
      const slug = String(r.slug), id = String(r.id);
      out.set(slug, id);
      memo.set(`${table}:${slug}`, id);
    }
  }
  return out;
}

/** One slug → uuid, or a NotFoundError (also what an unreadable row looks like: the database never reveals the difference). */
export async function resolveSlug(db: Db, table: SlugTable, slug: string, what: string = table): Promise<string> {
  const id = (await resolveSlugs(db, table, [slug])).get(slug);
  if (!id) throw new NotFoundError(`Unknown ${what}: ${slug}`);
  return id;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Entity ids that are uuids in the database (evidence, projects, proposals, seats, assignments). Anything else cannot exist. */
export const isUuid = (v: string): boolean => UUID.test(v);
