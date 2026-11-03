import { useQuery } from '@tanstack/react-query';
import type { AuditEntryDto, SubscriptionDto } from '@ongod/shared';
import { Badge, Button, Input, Notice, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { plansQuery, useDecisions, useUserActions, userQuery } from '../api/queries';
import {
  AccessBadge,
  BackLink,
  Fact,
  LoadError,
  PageHeader,
  SelectField,
  SubscriptionBadge,
  UserStatusBadge,
  useNow,
} from '../components/bits';
import { ConfirmDialog } from '../components/Modal';
import {
  DAY_MS,
  MAX_GRANT_DAYS,
  accessState,
  auditOf,
  isValidGrantDays,
  previewPeriod,
} from '../lib/access';
import { formatDate, formatDateTime, formatMnt } from '../lib/format';
import { mn } from '../i18n/mn';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery(userQuery(id));
  const now = useNow();

  if (detail.error) return <LoadError error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) {
    return (
      <>
        <Skeleton width="40%" />
        <Skeleton width="70%" />
      </>
    );
  }

  const { user, devices, subscriptions, audit } = detail.data;
  const name = `${user.lastName} ${user.firstName}`.trim();
  const t = mn.users.detail;
  const state = accessState(user.accessUntil, now);

  return (
    <div className="admin-user-page">
      <BackLink to="/users">{t.back}</BackLink>
      <PageHeader title={name} subtitle={`@${user.username}`} />

      <div className="admin-user-split">
        <div className="admin-user-split__side">
          <section className="admin-card" aria-labelledby="user-account">
            <h2 id="user-account" className="admin-card__title">
              {t.account}
            </h2>
            <dl className="admin-facts">
              <Fact label={mn.users.columns.username}>@{user.username}</Fact>
              <Fact label={mn.users.columns.email}>
                {user.email}{' '}
                <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                  {user.emailVerified ? t.emailVerified : t.notVerified}
                </Badge>
              </Fact>
              <Fact label={mn.users.columns.phone}>{user.phone}</Fact>
              <Fact label={t.role}>{mn.roles[user.role]}</Fact>
              <Fact label={t.accountStatus}>
                <UserStatusBadge status={user.status} />
              </Fact>
              <Fact label={mn.users.columns.registered}>{formatDateTime(user.createdAt)}</Fact>
            </dl>
          </section>

          <section className="admin-card" aria-labelledby="user-access">
            <h2 id="user-access" className="admin-card__title">
              {t.access}
            </h2>
            <dl className="admin-facts">
              <Fact label={t.accessStatus}>
                <AccessBadge state={state} />
              </Fact>
              <Fact label={t.accessUntil}>
                {user.accessUntil ? (
                  <>
                    {formatDateTime(user.accessUntil)}
                    {state === 'ACTIVE' ? (
                      <span className="admin-fact__note">
                        {t.accessLeft(Math.ceil((Date.parse(user.accessUntil) - now) / DAY_MS))}
                      </span>
                    ) : null}
                  </>
                ) : (
                  t.accessNever
                )}
              </Fact>
            </dl>
          </section>
        </div>

        <div className="admin-user-split__main">
          <GrantCard userId={user.id} name={name} accessUntil={user.accessUntil} now={now} />
        </div>
      </div>

      <DevicesCard userId={user.id} devices={devices} />
      <HistoryCard subscriptions={subscriptions} audit={audit} />

      <section className="admin-card" aria-labelledby="user-audit">
        <h2 id="user-audit" className="admin-card__title">
          {t.audit}
        </h2>
        {audit.length === 0 ? <p className="admin-hint">{mn.audit.empty}</p> : null}
        <ul className="admin-history">
          {audit.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              <span>
                @{entry.actor.username} · <code>{entry.action}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function GrantCard({
  userId,
  name,
  accessUntil,
  now,
}: {
  userId: string;
  name: string;
  accessUntil: string | null;
  now: number;
}) {
  const t = mn.users.detail;
  const toast = useToast();
  const plans = useQuery(plansQuery());
  const { grant } = useUserActions(userId);
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  // One key per intended grant: retrying after a lost answer cannot grant twice (audit F02).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const selectedPlan = plans.data?.plans.find(
    (plan) => plan.id === (planId || plans.data?.plans[0]?.id),
  );
  const dayCount = days === '' ? selectedPlan?.durationDays : Number(days);
  const daysValid = isValidGrantDays(dayCount);
  const valid = selectedPlan !== undefined && daysValid;
  const period = previewPeriod(now, accessUntil, dayCount);
  const until = period ? formatDateTime(new Date(period.end).toISOString()) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid && !grant.isPending) setConfirming(true);
  }

  return (
    <section className="admin-card" aria-labelledby="user-grant">
      <h2 id="user-grant" className="admin-card__title">
        {t.grant}
      </h2>
      <p className="admin-hint">{t.grantText}</p>
      {plans.error ? <LoadError error={plans.error} onRetry={() => void plans.refetch()} /> : null}
      {plans.data ? (
        <form className="admin-form" onSubmit={submit} noValidate>
          <SelectField
            label={t.grantPlan}
            value={selectedPlan?.id ?? ''}
            onChange={setPlanId}
            options={plans.data.plans.map((plan) => ({
              value: plan.id,
              label: t.grantPlanOption(
                plan.name,
                mn.common.days(plan.durationDays),
                formatMnt(plan.priceMnt),
              ),
            }))}
          />
          {selectedPlan ? (
            <p className="admin-hint">{t.grantCharge(formatMnt(selectedPlan.priceMnt))}</p>
          ) : null}
          <Input
            label={t.grantDays}
            type="number"
            min={1}
            max={MAX_GRANT_DAYS}
            inputMode="numeric"
            value={days}
            placeholder={selectedPlan ? String(selectedPlan.durationDays) : ''}
            hint={selectedPlan ? t.grantDaysHint(selectedPlan.durationDays) : undefined}
            error={days !== '' && !daysValid ? t.grantDaysError : undefined}
            onChange={(event) => setDays(event.target.value)}
          />
          <GrantPreview
            accessUntil={accessUntil}
            period={period}
            hasPlan={selectedPlan !== undefined}
          />
          <Textarea
            label={t.grantNote}
            hint={t.grantNoteHint}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button type="submit" disabled={!valid} loading={grant.isPending}>
            {t.grantSubmit}
          </Button>
        </form>
      ) : plans.error ? null : (
        <Skeleton width="60%" />
      )}
      <ConfirmDialog
        open={confirming}
        title={t.grantConfirmTitle}
        text={t.grantConfirmText(name, dayCount ?? 0, until)}
        confirmLabel={t.grantSubmit}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (!selectedPlan) return;
          await grant.mutateAsync({
            planId: selectedPlan.id,
            ...(days !== '' ? { days: Number(days) } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            requestId,
          });
          setRequestId(crypto.randomUUID());
          toast.show(t.granted, { tone: 'success' });
          setDays('');
          setNote('');
        }}
      />
    </section>
  );
}

/** What the grant will do to the access, before it is confirmed. */
function GrantPreview({
  accessUntil,
  period,
  hasPlan,
}: {
  accessUntil: string | null;
  period: ReturnType<typeof previewPeriod>;
  hasPlan: boolean;
}) {
  const p = mn.users.detail.preview;
  const iso = (ms: number) => new Date(ms).toISOString();
  return (
    <Notice tone="info" className="admin-grant-preview">
      <div className="admin-grant-preview__body" aria-live="polite">
        <strong>{p.title}</strong>
        <p>{period?.extends && accessUntil ? p.current(formatDateTime(accessUntil)) : p.none}</p>
        {period ? (
          <>
            <p>{period.extends ? p.extend : p.fresh}</p>
            <p>
              <strong>
                {p.result(formatDateTime(iso(period.start)), formatDateTime(iso(period.end)))}
              </strong>
            </p>
            <p className="admin-hint">{p.approx}</p>
          </>
        ) : (
          <p>{hasPlan ? p.invalid : p.noPlan}</p>
        )}
      </div>
    </Notice>
  );
}

type Device = { id: string; platform: string; model: string | null; lastSeenAt: string };

function DevicesCard({ userId, devices }: { userId: string; devices: Device[] }) {
  const t = mn.users.detail;
  const toast = useToast();
  const { removeDevice } = useUserActions(userId);
  const [removing, setRemoving] = useState<Device>();
  const heading = useRef<HTMLHeadingElement>(null);
  const removed = useRef(false);

  // The removed row (and its button) is gone: after the dialog has closed, focus goes to the
  // card heading instead of falling back to the page. Parent effects run after the dialog's own.
  useEffect(() => {
    if (removing === undefined && removed.current) {
      removed.current = false;
      heading.current?.focus();
    }
  }, [removing]);

  const label = (d: Device) => d.model ?? d.platform;

  return (
    <section className="admin-card" aria-labelledby="user-devices">
      <h2 id="user-devices" className="admin-card__title" ref={heading} tabIndex={-1}>
        {t.devices}
      </h2>
      {devices.length === 0 ? <p className="admin-hint">{t.noDevices}</p> : null}
      <ul className="admin-list">
        {devices.map((device) => (
          <li key={device.id} className="admin-list__row admin-device">
            <span className="admin-device__info">
              <strong>{label(device)}</strong>
              <small>
                {device.model ? `${device.platform} · ` : ''}
                {t.lastActive(formatDateTime(device.lastSeenAt))}
              </small>
            </span>
            <Button
              variant="secondary"
              className="admin-danger-button"
              onClick={() => setRemoving(device)}
            >
              {t.removeDevice}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== undefined}
        title={t.removeDeviceTitle}
        text={
          removing
            ? t.removeDeviceText(mn.login.device(removing.platform, removing.model))
            : undefined
        }
        confirmLabel={t.removeDevice}
        tone="destructive"
        onClose={() => setRemoving(undefined)}
        onConfirm={async () => {
          if (!removing) return;
          await removeDevice.mutateAsync(removing.id);
          removed.current = true;
          toast.show(t.deviceRemoved, { tone: 'success' });
        }}
      />
    </section>
  );
}

function HistoryCard({
  subscriptions,
  audit,
}: {
  subscriptions: SubscriptionDto[];
  audit: AuditEntryDto[];
}) {
  const t = mn.users.detail;
  return (
    <section className="admin-card" aria-labelledby="user-subs">
      <h2 id="user-subs" className="admin-card__title">
        {t.subscriptions}
      </h2>
      {subscriptions.length === 0 ? <p className="admin-hint">{t.noSubscriptions}</p> : null}
      <ul className="admin-list">
        {subscriptions.map((subscription) => (
          <SubscriptionItem key={subscription.id} subscription={subscription} audit={audit} />
        ))}
      </ul>
      {subscriptions.length > 0 ? <p className="admin-hint">{t.historyHint}</p> : null}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-sub__cell">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SubscriptionItem({
  subscription: s,
  audit,
}: {
  subscription: SubscriptionDto;
  audit: AuditEntryDto[];
}) {
  const t = mn.users.detail;
  const toast = useToast();
  const { revoke } = useDecisions();
  const [revoking, setRevoking] = useState(false);
  const [refund, setRefund] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const revoked = useRef(false);

  // After a revoke the button is gone; focus the row once the dialog has closed.
  useEffect(() => {
    if (!revoking && revoked.current) {
      revoked.current = false;
      row.current?.focus();
    }
  }, [revoking]);

  const log = auditOf(audit, s.id);
  // Only an audit entry proves a manual grant; 0 ₮ alone does not.
  const source = log.grant
    ? t.sources.grant
    : s.paymentProvider === 'NONE'
      ? t.sources.unknown
      : t.sources[s.paymentProvider];

  return (
    <li className="admin-sub" ref={row} tabIndex={-1}>
      <div className="admin-sub__head">
        <span className="admin-sub__title">
          <code className="admin-code">{s.referenceCode}</code>
          <SubscriptionBadge status={s.status} />
          <strong>{s.plan.name}</strong>
        </span>
        {s.status === 'ACTIVE' ? (
          <>
            <Button
              variant="secondary"
              className="admin-danger-button"
              onClick={() => setRevoking(true)}
            >
              {t.revoke}
            </Button>
            <ConfirmDialog
              open={revoking}
              title={t.revokeTitle}
              text={t.revokeText}
              reason={{ label: t.revokeReason }}
              confirmLabel={t.revoke}
              tone="destructive"
              onClose={() => setRevoking(false)}
              onConfirm={async (reason) => {
                await revoke.mutateAsync({ id: s.id, reason, refund });
                revoked.current = true;
                toast.show(t.revoked, { tone: 'success' });
              }}
            >
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={refund}
                  onChange={(event) => setRefund(event.target.checked)}
                />
                <span>{t.revokeRefund}</span>
              </label>
            </ConfirmDialog>
          </>
        ) : null}
      </div>
      <dl className="admin-sub__grid">
        <Cell label={t.fields.source}>{source}</Cell>
        <Cell label={t.fields.amount}>
          {formatMnt(s.amountMnt)}
          {log.grant && s.amountMnt === 0 ? ` · ${t.free}` : ''}
        </Cell>
        <Cell label={t.fields.period}>
          {s.startsAt && s.endsAt
            ? `${formatDate(s.startsAt)} → ${formatDate(s.endsAt)}`
            : t.noPeriod}
        </Cell>
        <Cell label={t.fields.created}>{formatDateTime(s.createdAt)}</Cell>
        {log.grant ? <Cell label={t.fields.granted}>@{log.grant.admin}</Cell> : null}
        {log.grant?.note ? <Cell label={t.fields.note}>{log.grant.note}</Cell> : null}
        {log.revoke ? <Cell label={t.fields.revoked}>@{log.revoke.admin}</Cell> : null}
        {log.revoke?.reason ? <Cell label={t.fields.reason}>{log.revoke.reason}</Cell> : null}
        {log.revoke?.refund ? <Cell label={t.fields.refund}>{t.refundMarked}</Cell> : null}
      </dl>
    </li>
  );
}
