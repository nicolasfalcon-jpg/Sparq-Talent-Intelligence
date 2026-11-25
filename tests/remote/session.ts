import { SEED_USERS } from "@/data/seed/ids";
import { Api, type RemoteStatus } from "./client";

type Ready = Extract<RemoteStatus, { state: "ready" }>;
export type DemoKey = (typeof SEED_USERS)[number]["key"];

/** One Api and lazily cached REAL access tokens (one GoTrue sign-in per account per file). */
export function remoteSession(status: Ready) {
  const api = new Api(status.cfg);
  const tokens = new Map<DemoKey, Promise<string>>();
  const token = (key: DemoKey): Promise<string> => {
    if (!tokens.has(key)) {
      const c = status.creds[key];
      if (!c) throw new Error(`No saved credentials for "${key}". Run npm run db:provision (use --rotate if the account already existed).`);
      tokens.set(key, api.signIn(c.email, c.password));
    }
    return tokens.get(key)!;
  };
  return { api, token };
}
