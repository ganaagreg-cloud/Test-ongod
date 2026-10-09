import { useQuery } from '@tanstack/react-query';
import type { SubscriptionDto } from '@ongod/shared';
import { Button, Input, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { plansQuery, useDecisions, useUserActions, userQuery } from '../api/queries';
import {
  Fact,
  LoadError,
  PageHeader,
  SelectField,
  SubscriptionBadge,
  UserStatusBadge,
} from '../components/bits';
import { ConfirmDialog } from '../components/Modal';
import { formatDate, formatDateTime, formatMnt } from '../lib/format';
import { mn } from '../i18n/mn';
import { hasAccess } from './Users';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery(userQuery(id));

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

  return (
    <>
      <Link className="admin-back" to="/users">
        ← {t.back}
      </Link>
      <PageHeader title={name}>
        <UserStatusBadge status={user.status} />
      </PageHeader>

      <div className="admin-columns">
        <section className="admin-card" aria-labelledby="user-info">
          <h2 id="user-info" className="admin-card__title">
            {t.info}
          </h2>
          <dl className="admin-facts">
            <Fact label={mn.users.columns.username}>@{user.username}</Fact>
            <Fact label={mn.users.columns.email}>
              {user.email} · {user.emailVerified ? t.emailVerified : t.notVerified}
            </Fact>
            <Fact label={mn.users.columns.phone}>{user.phone}</Fact>
            <Fact label={t.role}>{mn.roles[user.role]}</Fact>
            <Fact label={t.accessUntil}>
              {hasAccess(user.accessUntil) ? formatDateTime(user.accessUntil!) : mn.users.noAccess}
            </Fact>
            <Fact label={mn.users.columns.registered}>{formatDateTime(user.createdAt)}</Fact>
          </dl>
        </section>

        <GrantCard userId={user.id} name={name} />
      </div>

      <section className="admin-card" aria-labelledby="user-devices">
        <h2 id="user-devices" className="admin-card__title">
          {t.devices}
        </h2>
        <DeviceList userId={user.id} devices={devices} />
      </section>

      <section className="admin-card" aria-labelledby="user-subs">
        <h2 id="user-subs" className="admin-card__title">
          {t.subscriptions}
        </h2>
        {subscriptions.length === 0 ? <p className="admin-hint">{t.noSubscriptions}</p> : null}
        <ul className="admin-list">
          {subscriptions.map((subscription) => (
            <SubscriptionItem key={subscription.id} subscription={subscription} />
          ))}
        </ul>
      </section>

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
    </>
  );
}

function GrantCard({ userId, name }: { userId: string; name: string }) {
  const t = mn.users.detail;
  const toast = useToast();
  const plans = useQuery(plansQuery());
  const { grant } = useUserActions(userId);
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const selectedPlan = plans.data?.plans.find(
    (plan) => plan.id === (planId || plans.data?.plans[0]?.id),
  );
  const dayCount = days === '' ? selectedPlan?.durationDays : Number(days);
  const valid =
    selectedPlan !== undefined &&
    dayCount !== undefined &&
    Number.isInteger(dayCount) &&
    dayCount >= 1 &&
    dayCount <= 3660;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) setConfirming(true);
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
              label: `${plan.name} · ${mn.common.days(plan.durationDays)} · ${formatMnt(plan.priceMnt)}`,
            }))}
          />
          <Input
            label={t.grantDays}
            type="number"
            min={1}
            max={3660}
            inputMode="numeric"
            value={days}
            placeholder={selectedPlan ? String(selectedPlan.durationDays) : ''}
            onChange={(event) => setDays(event.target.value)}
          />
          <Textarea
            label={t.grantNote}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button type="submit" disabled={!valid}>
            {t.grantSubmit}
          </Button>
        </form>
      ) : (
        <Skeleton width="60%" />
      )}
      <ConfirmDialog
        open={confirming}
        title={t.grantConfirmTitle}
        text={t.grantConfirmText(name, dayCount ?? 0)}
        confirmLabel={t.grantSubmit}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (!selectedPlan) return;
          await grant.mutateAsync({
            planId: selectedPlan.id,
            ...(days !== '' ? { days: Number(days) } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          });
          toast.show(t.granted, { tone: 'success' });
          setDays('');
          setNote('');
        }}
      />
    </section>
  );
}

function DeviceList({
  userId,
  devices,
}: {
  userId: string;
  devices: { id: string; platform: string; model: string | null; lastSeenAt: string }[];
}) {
  const t = mn.users.detail;
  const toast = useToast();
  const { removeDevice } = useUserActions(userId);
  const [removing, setRemoving] = useState<(typeof devices)[number]>();

  if (devices.length === 0) return <p className="admin-hint">{t.noDevices}</p>;
  const label = (d: (typeof devices)[number]) => mn.login.device(d.platform, d.model);

  return (
    <>
      <ul className="admin-list">
        {devices.map((device) => (
          <li key={device.id} className="admin-list__row">
            <span>
              <strong>{label(device)}</strong>
              <br />
              <small>{mn.login.lastSeen(formatDateTime(device.lastSeenAt))}</small>
            </span>
            <Button variant="secondary" onClick={() => setRemoving(device)}>
              {t.removeDevice}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== undefined}
        title={t.removeDeviceTitle}
        text={removing ? t.removeDeviceText(label(removing)) : undefined}
        confirmLabel={t.removeDevice}
        tone="destructive"
        onClose={() => setRemoving(undefined)}
        onConfirm={async () => {
          if (!removing) return;
          await removeDevice.mutateAsync(removing.id);
          toast.show(t.deviceRemoved, { tone: 'success' });
        }}
      />
    </>
  );
}

function SubscriptionItem({ subscription: s }: { subscription: SubscriptionDto }) {
  const t = mn.users.detail;
  const toast = useToast();
  const { revoke } = useDecisions();
  const [revoking, setRevoking] = useState(false);
  const [refund, setRefund] = useState(false);

  return (
    <li className="admin-list__row">
      <span>
        <code className="admin-code">{s.referenceCode}</code>{' '}
        <SubscriptionBadge status={s.status} />
        <br />
        <small>
          {s.plan.name} · {formatMnt(s.amountMnt)}
          {s.startsAt && s.endsAt ? ` · ${formatDate(s.startsAt)} → ${formatDate(s.endsAt)}` : ''}
        </small>
        {s.rejectReason ? (
          <>
            <br />
            <small>{s.rejectReason}</small>
          </>
        ) : null}
      </span>
      {s.status === 'ACTIVE' ? (
        <>
          <Button variant="secondary" onClick={() => setRevoking(true)}>
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
    </li>
  );
}
