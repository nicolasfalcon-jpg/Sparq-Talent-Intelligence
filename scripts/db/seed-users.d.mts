export const SEED_NAMESPACE: string;
export function uuidV5(name: string, namespace?: string): string;
export function userId(key: string): string;
export const DEMO_USERS: { key: string; name: string; title: string; roles: string[] }[];
export function demoEmail(key: string): string;
export function demoAuthUsersSql(): string;
