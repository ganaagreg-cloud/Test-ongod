import { Chip, IconButton } from '@ongod/ui-web';
import { useState } from 'react';
import { mn } from '../i18n/mn';
import { toUlaanbaatarInputValue } from '../lib/format';

const TIMES = ['08:00', '09:00', '12:00', '18:00', '19:00', '20:00', '21:00'];
const DAYS_AHEAD = 5;
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/** "2026-10-26" plus n days (calendar arithmetic only, no time zone involved). */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

interface SchedulePickerProps {
  /** "YYYY-MM-DDTHH:mm" in Ulaanbaatar time, or "" for nothing picked yet. */
  value: string;
  onChange: (value: string) => void;
  /** The current time (ms), so a time that has passed today cannot be picked. */
  now: number;
}

/**
 * Day chips (today, tomorrow, the next days by name), a grid of usual times, and plain date and
 * time fields for anything else. Replaces the browser's single date-time box.
 */
export function SchedulePicker({ value, onChange, now }: SchedulePickerProps) {
  const t = mn.episodes.schedule;
  const nowLocal = toUlaanbaatarInputValue(new Date(now));
  const today = nowLocal.slice(0, 10);
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const ymd = addDays(today, i);
    return { ymd, label: i === 0 ? t.today : i === 1 ? t.tomorrow : t.weekdays[weekdayOf(ymd)]! };
  });
  const usualDay = days.some((day) => day.ymd === date);
  const usualTime = TIMES.includes(time);
  // Another day or time was set (or loaded from the server): show its plain fields.
  const [custom, setCustom] = useState((date !== '' && !usualDay) || (time !== '' && !usualTime));

  const pick = (nextDate: string, nextTime: string) => {
    const d = nextDate || addDays(today, 1);
    onChange(`${d}T${nextTime || '09:00'}`);
  };
  const past = (hhmm: string) => (date || today) === today && `${today}T${hhmm}` <= nowLocal;

  return (
    <div className="admin-schedule">
      <div className="admin-schedule__group">
        <span className="admin-schedule__label">{t.day}</span>
        <div className="admin-schedule__chips">
          {days.map((day) => (
            <Chip key={day.ymd} selected={date === day.ymd} onClick={() => pick(day.ymd, time)}>
              {day.label}
            </Chip>
          ))}
          <Chip selected={custom} onClick={() => setCustom((on) => !on)}>
            {t.other}
          </Chip>
        </div>
      </div>
      <div className="admin-schedule__group">
        <span className="admin-schedule__label">{t.time}</span>
        <div className="admin-schedule__times">
          {TIMES.map((hhmm) => (
            <Chip
              key={hhmm}
              selected={time === hhmm}
              disabled={past(hhmm)}
              onClick={() => pick(date, hhmm)}
            >
              {hhmm}
            </Chip>
          ))}
        </div>
      </div>
      {custom ? (
        <div className="admin-schedule__custom">
          <MiniCalendar value={date} min={today} onPick={(ymd) => pick(ymd, time)} />
          <div className="admin-schedule__clock">
            <label className="ui-field">
              <span className="ui-field__label">{t.hour}</span>
              <select
                className="ui-field__input"
                value={time.slice(0, 2) || '09'}
                onChange={(event) =>
                  pick(date, `${event.target.value}:${time.slice(3, 5) || '00'}`)
                }
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">{t.minute}</span>
              <select
                className="ui-field__input"
                value={time.slice(3, 5) || '00'}
                onChange={(event) =>
                  pick(date, `${time.slice(0, 2) || '09'}:${event.target.value}`)
                }
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One month as a grid of days (Monday first); days before `min` cannot be picked. */
function MiniCalendar({
  value,
  min,
  onPick,
}: {
  value: string;
  min: string;
  onPick: (ymd: string) => void;
}) {
  const c = mn.episodes.calendar;
  const [view, setView] = useState((value || min).slice(0, 7));
  const [y, m] = view.split('-').map(Number) as [number, number];
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) =>
    setView(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));

  return (
    <div className="admin-minical">
      <div className="admin-minical__nav">
        <IconButton
          icon="chevronLeft"
          label={c.previous}
          disabled={view <= min.slice(0, 7)}
          onClick={() => shift(-1)}
        />
        <strong aria-live="polite">{c.month(y, m)}</strong>
        <IconButton icon="chevronRight" label={c.next} onClick={() => shift(1)} />
      </div>
      <div className="admin-minical__grid">
        {c.weekdays.map((name) => (
          <span key={name} className="admin-minical__weekday" aria-hidden="true">
            {name}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const ymd = `${view}-${pad(i + 1)}`;
          return (
            <button
              key={ymd}
              type="button"
              className="admin-minical__day"
              aria-pressed={ymd === value}
              aria-label={ymd}
              disabled={ymd < min}
              onClick={() => onPick(ymd)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
