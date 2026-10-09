/** Everything the owner sees is in Ulaanbaatar time (SPEC G: the schedule picker too). */
export const UB_ZONE = 'Asia/Ulaanbaatar';

const dateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: UB_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateOnly = new Intl.DateTimeFormat('sv-SE', { timeZone: UB_ZONE });

/** "2027.10.08" */
export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso)).replaceAll('-', '.');
}

/** "2027.10.08 14:30" */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso)).replaceAll('-', '.');
}

/** "100,000₮" */
export function formatMnt(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)}₮`;
}

/** "12.4 MB" */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** "32:05" or "1:02:03" */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const parts = (date: Date) => {
  const get = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: UB_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    hour: Number(get.hour),
    minute: Number(get.minute),
    second: Number(get.second),
  };
};

/** How far Ulaanbaatar is ahead of UTC at this instant, in milliseconds. */
function zoneOffsetMs(date: Date): number {
  const p = parts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Turns the value of an `<input type="datetime-local">` (a wall-clock time the admin means in
 * Ulaanbaatar, whatever the computer's own time zone is) into the exact instant.
 */
export function ulaanbaatarInputToDate(value: string): Date | undefined {
  const m = LOCAL_INPUT.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset even next to a DST change (Mongolia has none since 2017).
  let instant = wall - zoneOffsetMs(new Date(wall));
  instant = wall - zoneOffsetMs(new Date(instant));
  return new Date(instant);
}

/** "2026-10-20T09:00:00+08:00": what the API wants for `scheduledFor`. */
export function toUlaanbaatarIso(date: Date): string {
  const offset = zoneOffsetMs(date);
  const p = parts(date);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const minutes = Math.round(offset / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Value for `<input type="datetime-local">` showing this instant in Ulaanbaatar time. */
export function toUlaanbaatarInputValue(date: Date): string {
  return toUlaanbaatarIso(date).slice(0, 16);
}

/** Today in Ulaanbaatar as YYYY-MM-DD. */
export function todayUlaanbaatar(): string {
  return toUlaanbaatarIso(new Date()).slice(0, 10);
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  ө: 'u',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ү: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** A starting point for a category slug from its Mongolian name; the admin can edit it. */
export function suggestSlug(name: string): string {
  const latin = [...name.toLowerCase()].map((c) => CYRILLIC_TO_LATIN[c] ?? c).join('');
  return latin
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
