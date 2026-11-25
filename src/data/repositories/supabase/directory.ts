/** DirectoryRepository over Supabase: the session user (role from `user_roles`, never from a token claim) and nothing else. */
import type { AppUser } from "@/domain/schemas";
import type { DirectoryRepository } from "../types";
import { isNoSession, row, rpcValue, type Db } from "./db";
import { mapUser, str } from "./mappers";

type GetDb = () => Promise<Db>;

/**
 * The caller's AppUser, or null without a valid session / without any role. Uses `my_identity()` (executed by PostgREST, which verifies the
 * JWT signature and expiry; `anon` cannot call it) then reads the display fields. Never throws for "not signed in".
 */
export async function loadCurrentUser(db: Db): Promise<AppUser | null> {
  let identity: unknown;
  try { identity = await rpcValue(db.rpc("my_identity")); } catch (e) { if (isNoSession(e)) return null; throw e; }
  if (!identity || typeof identity !== "object") return null;
  const i = identity as { user_id?: unknown; display_name?: unknown; person_id?: unknown; roles?: unknown };
  if (!i.user_id) return null;
  const id = str(i.user_id);
  const [profile, person] = await Promise.all([
    row(db.from("app_users").select("title").eq("id", id).maybeSingle()),
    i.person_id ? row(db.from("people").select("slug").eq("id", str(i.person_id)).maybeSingle()) : Promise.resolve(null),
  ]);
  return mapUser({ id, displayName: str(i.display_name), title: profile ? str(profile.title) : "", roles: Array.isArray(i.roles) ? i.roles : [], personSlug: person ? str(person.slug) : null });
}

// One lookup per client (= per request): the session is asked for many times while a page renders.
const memo = new WeakMap<Db, Promise<AppUser | null>>();

export function createDirectoryRepository(getDb: GetDb): DirectoryRepository {
  return {
    async getUserByRole() { throw new Error("getUserByRole is the demo persona (memory mode). Supabase mode uses getCurrentUser."); },
    async getCurrentUser() {
      const db = await getDb();
      let p = memo.get(db);
      if (!p) { p = loadCurrentUser(db); memo.set(db, p); }
      return p;
    },
    async listNotifications() { return []; }, // no notifications table in this release (real-time notifications are out of scope)
  };
}
