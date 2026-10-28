// Pure helpers for the episode screens (Нүүр, Сан, Хадгалсан, Player, Профайл): labels, progress,
// countdown, access. No React Native here, so the rules are unit-tested (test/screens.test.ts).
import { formatDurationMn, type EpisodeItem, type EpisodesPage } from '@ongod/shared';
import { mn } from '../i18n/mn';

const TIME_ZONE = 'Asia/Ulaanbaatar';
const DAY_MS = 24 * 60 * 60_000;

/** "36:00", "1:15:00": the duration badge on pictures and the player times. */
export function clockLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** Hour of the day in Ulaanbaatar. */
function hourInMongolia(now: Date): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    return Number(hour);
  } catch {
    return now.getHours();
  }
}

/** "Өглөөний мэнд," 5–11, "Өдрийн мэнд," 12–17, "Оройн мэнд," otherwise (Ulaanbaatar time). */
export function greeting(now: Date): string {
  const hour = hourInMongolia(now);
  if (hour >= 5 && hour < 12) return mn.home.greetingMorning;
  if (hour >= 12 && hour < 18) return mn.home.greetingDay;
  return mn.home.greetingEvening;
}

/** The year an episode came out, in Ulaanbaatar time. */
function yearOf(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 4);
  }
}

/** "Сэтгэл зүй · 2026" under a title; "Сэтгэл зүй · 2026 · 36 мин" with `withLength`. */
export function episodeMeta(item: EpisodeItem, withLength = false): string {
  const parts = [item.category.name, yearOf(item.publishedAt)];
  if (item.series?.part != null) parts.push(mn.series.part(item.series.part));
  if (withLength && item.durationSec) parts.push(formatDurationMn(item.durationSec));
  return parts.join(' · ');
}

/** Badge text on a picture, or undefined when the length is not known yet. */
export function durationBadge(item: Pick<EpisodeItem, 'durationSec'>): string | undefined {
  return item.durationSec ? clockLabel(item.durationSec) : undefined;
}

/** How far a member got: 0..1, or undefined if never started (or no length known). */
export function progressFraction(item: EpisodeItem): number | undefined {
  if (!item.progress) return undefined;
  if (item.progress.completed) return 1;
  if (!item.durationSec || item.progress.positionSec <= 0) return undefined;
  return Math.min(1, item.progress.positionSec / item.durationSec);
}

/** The progress line of a list row: value + its spoken label, or undefined. */
export function rowProgress(item: EpisodeItem): { value: number; label: string } | undefined {
  const value = progressFraction(item);
  if (value === undefined) return undefined;
  if (item.progress?.completed) return { value: 1, label: mn.episode.heard };
  return { value, label: mn.episode.progress(Math.round(value * 100)) };
}

/** "18 мин үлдсэн" on the continue card. */
export function remainingLabel(item: EpisodeItem): string | undefined {
  if (!item.durationSec || !item.progress) return undefined;
  const left = item.durationSec - item.progress.positionSec;
  return left > 0 ? mn.home.remaining(formatDurationMn(left)) : undefined;
}

/** Where playback should start: the saved position, or 0 for a finished or new episode. */
export function resumeAt(item: EpisodeItem): number {
  return item.progress && !item.progress.completed ? item.progress.positionSec : 0;
}

/** "2 өдөр 14:22:09", or "14:22:09" within the last day; "0:00:00" once due. */
export function countdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const days = Math.floor(total / 86_400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${Math.floor((total % 86_400) / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? mn.home.countdownDays(days, hms) : hms;
}

/** The day tile of the next-release card: "НЯМ" and "12", in Ulaanbaatar time. */
export function dayTile(iso: string): { weekday: string; day: string } {
  const date = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      weekday: 'short',
      day: 'numeric',
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    return {
      weekday: mn.home.weekdays[index < 0 ? date.getDay() : index] ?? '',
      day: parts.find((p) => p.type === 'day')?.value ?? String(date.getDate()),
    };
  } catch {
    return { weekday: mn.home.weekdays[date.getDay()] ?? '', day: String(date.getDate()) };
  }
}

/** What the profile card and the no-access sheet need to know about access. */
export interface AccessState {
  active: boolean;
  /** Whole days left (rounded up), 0 when inactive. */
  daysLeft: number;
  /** 0..1 of a year, for the days-left ring. */
  fraction: number;
}

export function accessState(accessUntil: string | null | undefined, now: Date): AccessState {
  const end = accessUntil ? Date.parse(accessUntil) : NaN;
  const left = end - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return { active: false, daysLeft: 0, fraction: 0 };
  const daysLeft = Math.ceil(left / DAY_MS);
  return { active: true, daysLeft, fraction: Math.min(1, daysLeft / 365) };
}

/**
 * A paid item the member cannot play: its picture is blurred in lists (ADR-0044). A free item is
 * never locked. Same rule as the server: access ending at or before now is no access.
 */
export function isLocked(
  item: Pick<EpisodeItem, 'isFree'>,
  accessUntil: string | null | undefined,
  now: Date,
): boolean {
  return !item.isFree && !accessState(accessUntil, now).active;
}

/** Whole hours for the profile stat (the ticker rolls whole digits). */
export function listenedHours(seconds: number): number {
  return Math.round(Math.max(0, seconds) / 3600);
}

// ---- the saved flag in cached lists (the bookmark shows at once, before the server answers) ----

/** The same list with one episode's `saved` flag changed (and `next` lists inside details). */
export function withSaved<T extends EpisodeItem>(
  items: readonly T[],
  id: string,
  saved: boolean,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, saved } : item));
}

/** Infinite-query pages with the flag changed; `dropUnsaved` removes it (the Хадгалсан list). */
export function pagesWithSaved<P extends { pages: EpisodesPage[] }>(
  data: P,
  id: string,
  saved: boolean,
  dropUnsaved = false,
): P {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items:
        dropUnsaved && !saved
          ? page.items.filter((item) => item.id !== id)
          : withSaved(page.items, id, saved),
    })),
  };
}
