/**
 * `server-only` throws when imported outside a React Server Component. Vitest
 * runs plain Node, so it is aliased to this no-op module. The guard still
 * applies to the real application build, which is where it matters.
 */
export {};
