import { useQuery } from '@tanstack/react-query';
import { PAGE_SIZE_MAX, type AdminEpisodeDto } from '@ongod/shared';
import { Button, Skeleton } from '@ongod/ui-web';
import { Link } from 'react-router';
import { episodesQuery, type EpisodesFilter } from '../api/queries';
import { mn } from '../i18n/mn';
import { toUlaanbaatarIso } from '../lib/format';
import { EPISODE_TONE, LoadError } from './bits';

const t = mn.episodes.calendar;

interface ContentCalendarProps {
  /** "2026-10" */
  month: string;
  /** The list filters (status, category, series ...) apply to the calendar too. */
  filter: EpisodesFilter;
  onMonth: (month: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, by: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + by, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** The first of the month as an instant in Ulaanbaatar time (UTC+8, no daylight saving). */
const monthStart = (month: string) => `${month}-01T00:00:00+08:00`;

/** The day an item is on the calendar: when it goes out (scheduled) or went out (published). */
function dateOf(episode: AdminEpisodeDto): string | null {
  return episode.status === 'SCHEDULED'
    ? episode.scheduledFor
    : (episode.publishedAt ?? episode.scheduledFor);
}

/** A month grid (Monday first): each scheduled or published item is a chip on its day. */
export function ContentCalendar({ month, filter, onMonth }: ContentCalendarProps) {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const list = useQuery(
    episodesQuery({
      ...filter,
      from: monthStart(month),
      to: monthStart(shiftMonth(month, 1)),
      page: 1,
      limit: PAGE_SIZE_MAX,
    }),
  );

  const byDay = new Map<string, AdminEpisodeDto[]>();
  for (const episode of list.data?.items ?? []) {
    const when = dateOf(episode);
    if (!when) continue;
    const day = toUlaanbaatarIso(new Date(when)).slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), episode]);
  }

  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  // Monday = 0 ... Sunday = 6
  const offset = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <section className="admin-cal" aria-label={t.caption}>
      <div className="admin-cal__nav">
        <Button variant="secondary" onClick={() => onMonth(shiftMonth(month, -1))}>
          {t.previous}
        </Button>
        <h2 className="admin-cal__month" aria-live="polite">
          {t.month(year, mon)}
        </h2>
        <Button variant="secondary" onClick={() => onMonth(shiftMonth(month, 1))}>
          {t.next}
        </Button>
      </div>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && list.data.total > list.data.items.length ? (
        <p className="admin-hint">{t.truncated(list.data.items.length, list.data.total)}</p>
      ) : null}
      <div className="admin-cal__grid">
        {t.weekdays.map((name) => (
          <div key={name} className="admin-cal__weekday" aria-hidden="true">
            {name}
          </div>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} className="admin-cal__blank" />;
          const key = `${month}-${pad(day)}`;
          const items = byDay.get(key) ?? [];
          return (
            <div key={key} className="admin-cal__day" data-day={key}>
              <span className="admin-cal__date">{day}</span>
              <ul className="admin-cal__items">
                {items.map((episode) => {
                  const when = dateOf(episode);
                  const time = when ? toUlaanbaatarIso(new Date(when)).slice(11, 16) : '';
                  return (
                    <li key={episode.id}>
                      <Link
                        className={`ui-badge ui-badge--${EPISODE_TONE[episode.status]} admin-cal__chip`}
                        to={`/episodes/${episode.id}`}
                        aria-label={t.chip(episode.title, mn.episodes.status[episode.status], time)}
                        title={episode.title}
                      >
                        {time} {episode.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {list.data && list.data.items.length === 0 ? <p className="admin-hint">{t.empty}</p> : null}
    </section>
  );
}
