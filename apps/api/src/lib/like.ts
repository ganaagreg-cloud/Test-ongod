/**
 * Prisma's `contains` does not escape LIKE wildcards, so a search for "%" would match everything.
 * Backslash is the default LIKE escape character in MySQL and PostgreSQL.
 */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');
