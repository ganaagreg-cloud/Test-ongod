import { randomInt } from 'node:crypto';
import { DAY_MS } from '../lib/dates';

/** No 0/O, 1/I/L: the code is read from a bank statement and typed by hand (ADR-0007). */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;

/** "ONG-K7M2Q". 31^5 = 28 million values; the unique index catches the rare collision. */
export function generateReferenceCode(): string {
  let tail = '';
  for (let i = 0; i < CODE_LENGTH; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `ONG-${tail}`;
}

/**
 * SPEC E: the period starts at max(now, current access end) and lasts the plan's days, so an
 * early renewal adds to the remaining time instead of overlapping it.
 */
export function computePeriod(now: Date, currentAccessEnd: Date | null, days: number) {
  const startsAt =
    currentAccessEnd && currentAccessEnd.getTime() > now.getTime() ? currentAccessEnd : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + days * DAY_MS) };
}
