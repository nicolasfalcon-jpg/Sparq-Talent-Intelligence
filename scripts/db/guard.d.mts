export class GuardError extends Error {}
export type Target = { ref: string; host: string; local: boolean };
export function projectRefFromDbUrl(dbUrl: string): Target;
export function projectRefFromHttpUrl(httpUrl: string): Target;
export function assertConfirmedProject(target: Target, env: Record<string, string | undefined>): void;
