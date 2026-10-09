import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ubDate, ubDateTime, ubDayStart } from '../src/lib/dates';
import { computePeriod, generateReferenceCode } from '../src/subscriptions/period';
import { createReceiptStore, sniffImage } from '../src/subscriptions/receipts';

const DAY = 86_400_000;

describe('computePeriod (SPEC E)', () => {
  const now = new Date('2026-10-08T00:00:00Z');

  it('starts now when there is no access', () => {
    const p = computePeriod(now, null, 365);
    expect(p.startsAt).toEqual(now);
    expect(p.endsAt.getTime()).toBe(now.getTime() + 365 * DAY);
  });

  it('starts at the current end when access is still running', () => {
    const end = new Date(now.getTime() + 100 * DAY);
    const p = computePeriod(now, end, 365);
    expect(p.startsAt).toEqual(end);
    expect(p.endsAt.getTime()).toBe(end.getTime() + 365 * DAY);
  });

  it('starts now when the old access ended, or ends exactly now', () => {
    expect(computePeriod(now, new Date(now.getTime() - DAY), 30).startsAt).toEqual(now);
    expect(computePeriod(now, new Date(now.getTime()), 30).startsAt).toEqual(now);
  });
});

describe('generateReferenceCode (ADR-0007)', () => {
  it('is ONG- plus 5 characters without look-alikes (0 O 1 I L)', () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateReferenceCode()).toMatch(/^ONG-[2-9A-HJKMNP-Z]{5}$/);
    }
  });

  it('does not repeat in a realistic sample', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateReferenceCode));
    expect(codes.size).toBeGreaterThan(1990);
  });
});

describe('sniffImage', () => {
  it('knows JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({
      ext: 'jpg',
      mime: 'image/jpeg',
    });
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe(
      'png',
    );
    expect(
      sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))
        ?.ext,
    ).toBe('webp');
  });

  it('refuses everything else, including empty and truncated input', () => {
    for (const data of [
      Buffer.alloc(0),
      Buffer.from([0xff, 0xd8]),
      Buffer.from('GIF89a'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from('<html><script>alert(1)</script>'),
      Buffer.from('%PDF-1.4'),
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]),
    ]) {
      expect(sniffImage(data)).toBeNull();
    }
  });
});

describe('receipt store', () => {
  const fresh = () => mkdtempSync(join(tmpdir(), 'ongod-store-'));

  it('saves under a random name, reads back with the right type, and removes', async () => {
    const dir = fresh();
    const store = createReceiptStore(dir);
    const data = Buffer.from([1, 2, 3, 4]);
    const key = await store.save(data, 'png');
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(readdirSync(dir)).toEqual([key]);
    const file = await store.read(key);
    expect(file?.data.equals(data)).toBe(true);
    expect(file?.mime).toBe('image/png');
    await store.remove(key);
    expect(await store.read(key)).toBeNull();
    await store.remove(key); // removing twice is fine
  });

  it('never turns a key into a path outside its folder', async () => {
    const store = createReceiptStore(fresh());
    for (const key of [
      '../x.jpg',
      '..\\x.jpg',
      '/etc/passwd',
      'a/b.jpg',
      'x.jpg',
      '',
      '.jpg',
      'a'.repeat(40) + '.jpg',
    ]) {
      expect(await store.read(key), key).toBeNull();
    }
    await expect(store.remove('../../x.jpg')).rejects.toThrow('invalid receipt key');
  });

  it('creates its folder on first use', async () => {
    const dir = join(fresh(), 'nested', 'receipts');
    const key = await createReceiptStore(dir).save(Buffer.from([1]), 'jpg');
    expect(readdirSync(dir)).toEqual([key]);
  });
});

describe('Ulaanbaatar dates', () => {
  it('formats in UTC+8', () => {
    const d = new Date('2026-10-08T17:30:00Z'); // 2026-10-09 01:30 in Ulaanbaatar
    expect(ubDate(d)).toBe('2026-10-09');
    expect(ubDateTime(d)).toBe('2026-10-09 01:30');
  });

  it('day start is midnight in Ulaanbaatar', () => {
    expect(ubDayStart('2026-10-09').toISOString()).toBe('2026-10-08T16:00:00.000Z');
  });
});
