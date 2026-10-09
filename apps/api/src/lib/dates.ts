export const DAY_MS = 86_400_000;

/** Ulaanbaatar is UTC+8 all year (no daylight saving). */
const UB_OFFSET_MS = 8 * 60 * 60_000;

/** "2026-10-08" in Ulaanbaatar time. */
export const ubDate = (d: Date) => new Date(d.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);

/** "2026-10-08 14:05" in Ulaanbaatar time. */
export const ubDateTime = (d: Date) =>
  new Date(d.getTime() + UB_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

/** Start of the given Ulaanbaatar calendar day (YYYY-MM-DD) as a UTC instant. */
export const ubDayStart = (isoDate: string) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) - UB_OFFSET_MS);
