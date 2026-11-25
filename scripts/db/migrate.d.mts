export const LOCK_KEY: number;
export const HISTORY_TABLE: string;
export class MigrationError extends Error {}
export type MigrationFile = { name: string; sql: string; sha: string };
export type Db = { query(sql: string, params?: unknown[]): Promise<Record<string, any>[]>; exec(sql: string): Promise<void> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export function sha256(text: string): string;
export function readMigrationFiles(dir?: string): MigrationFile[];
export function migrate(db: Db, opts: { files: MigrationFile[]; seedSql?: string | null; status?: boolean; dryRun?: boolean; baseline?: string | null; log?: (m: string) => void; appliedBy?: string }): Promise<{ applied: string[]; pending: string[]; ran: string[]; seeded: boolean }>;
export function pgDb(client: unknown): Db;
export function pgliteDb(pglite: unknown): Db;
export function prepareTarget(env: Record<string, string | undefined>): { target: { ref: string; host: string; local: boolean }; connectionString: string; ssl: false | { rejectUnauthorized: boolean } };
export function parseArgs(argv: string[]): { status: boolean; dryRun: boolean; seed: boolean; baseline: string | null };
