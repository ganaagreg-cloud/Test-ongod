import { mn } from '../i18n/mn';
import { formatDate, formatDateTime } from './format';

/** The Ulaanbaatar calendar day of an instant, as a day count (so "tomorrow" is exactly +1). */
const dayNumber = (iso: string): number => {
  const [y, m, d] = formatDate(iso).split('.').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * A date for a list cell: within 7 days of today it reads "маргааш 08:56", further away only the
 * date. `title` is always the full date and time, for the tooltip. Ulaanbaatar time throughout.
 */
export function whenLabel(iso: string, now: number = Date.now()): { text: string; title: string } {
  const title = formatDateTime(iso);
  const time = title.slice(-5);
  const diff = dayNumber(iso) - dayNumber(new Date(now).toISOString());
  const t = mn.when;
  if (diff === 0) return { text: `${t.today} ${time}`, title };
  if (diff === 1) return { text: `${t.tomorrow} ${time}`, title };
  if (diff === -1) return { text: `${t.yesterday} ${time}`, title };
  if (diff > 1 && diff <= 7) return { text: `${t.inDays(diff)} ${time}`, title };
  if (diff < -1 && diff >= -7) return { text: `${t.daysAgo(-diff)} ${time}`, title };
  return { text: formatDate(iso), title };
}
