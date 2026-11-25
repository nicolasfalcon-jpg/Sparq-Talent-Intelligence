export class ProvisionError extends Error {}
export const CREDENTIALS_FILE: string;
export function defaultPassword(): string;
export function planAccounts(): { key: string; id: string; email: string; name: string; role: string }[];
export function provision(opts: {
  env: Record<string, string | undefined>; fetchImpl?: typeof fetch; credentialsPath?: string; dryRun?: boolean; rotate?: boolean; log?: (m: string) => void; randomPassword?: () => string;
}): Promise<{ created: string[]; existing: string[]; rotated: string[]; dryRun: boolean }>;
