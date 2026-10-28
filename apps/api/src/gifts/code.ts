import { randomInt } from 'node:crypto';
import { formatGiftCode } from '@ongod/shared';

/** The reference-code alphabet: no 0/O, 1/I/L (ADR-0007), so a code can be read out or typed. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 12;

/** "K7M2-QX9A-H4PR": 31^12 values from the system's CSPRNG; the unique index catches a clash. */
export function generateGiftCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return formatGiftCode(code);
}
