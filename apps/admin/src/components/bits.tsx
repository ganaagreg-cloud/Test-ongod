import { Badge, Button, Notice, type BadgeTone } from '@ongod/ui-web';
import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { ApiError } from '../api/client';
import { mn } from '../i18n/mn';

/** A value that follows `value` after the user stopped typing for `ms`. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * The page number of a paged list. It goes back to 1 by itself when `resetKey` changes (a new
 * search or filter), without an effect: the stored page remembers which key it belongs to.
 */
export function usePage(resetKey: string): [number, (page: number) => void] {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const page = state.key === resetKey ? state.page : 1;
  return [page, (next) => setState({ key: resetKey, page: next })];
}

/** The current time, refreshed every `ms`, for validity checks that must not call Date.now() while rendering. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

const SUBSCRIPTION_TONE: Record<keyof typeof mn.subscriptionStatus, BadgeTone> = {
  PENDING_PAYMENT: 'neutral',
  PAYMENT_SUBMITTED: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  REVOKED: 'danger',
};

export function SubscriptionBadge({ status }: { status: keyof typeof mn.subscriptionStatus }) {
  return <Badge tone={SUBSCRIPTION_TONE[status]}>{mn.subscriptionStatus[status]}</Badge>;
}

const EPISODE_TONE: Record<keyof typeof mn.episodes.status, BadgeTone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export function EpisodeBadge({ status }: { status: keyof typeof mn.episodes.status }) {
  return <Badge tone={EPISODE_TONE[status]}>{mn.episodes.status[status]}</Badge>;
}

const MEDIA_TONE: Record<keyof typeof mn.episodes.mediaStatus, BadgeTone> = {
  UPLOADING: 'info',
  PROCESSING: 'info',
  READY: 'success',
  FAILED: 'danger',
};

export function MediaBadge({ status }: { status: keyof typeof mn.episodes.mediaStatus }) {
  return <Badge tone={MEDIA_TONE[status]}>{mn.episodes.mediaStatus[status]}</Badge>;
}

const USER_TONE: Record<keyof typeof mn.userStatus, BadgeTone> = {
  PENDING_PROFILE: 'warning',
  ACTIVE: 'success',
  DISABLED: 'danger',
  DELETED: 'neutral',
};

export function UserStatusBadge({ status }: { status: keyof typeof mn.userStatus }) {
  return <Badge tone={USER_TONE[status]}>{mn.userStatus[status]}</Badge>;
}

/** A failed load, in the server's own (Mongolian) words, with a retry. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : mn.common.errorGeneric;
  return (
    <div className="admin-load-error">
      <Notice tone="danger">{message}</Notice>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {mn.common.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function Pager({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <nav className="admin-pager" aria-label={mn.common.page(page, pages)}>
      <span className="admin-pager__total">{mn.common.total(total)}</span>
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {mn.common.previous}
      </Button>
      <span aria-live="polite">{mn.common.page(page, pages)}</span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {mn.common.next}
      </Button>
    </nav>
  );
}

/** Title row of a page: heading on the left, actions on the right. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="admin-page-header">
      <h1 className="admin-page-title">{title}</h1>
      {children ? <div className="admin-page-actions">{children}</div> : null}
    </header>
  );
}

/** A label/value pair in a description list. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Native <select> with the same label, hint and look as ui-web's <Input>. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  id?: string;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        className="ui-field__input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
