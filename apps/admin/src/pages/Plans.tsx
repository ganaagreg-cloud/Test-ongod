import { useQuery } from '@tanstack/react-query';
import { PLAN_PRICE_MIN_MNT, type AdminPlanDto } from '@ongod/shared';
import { Badge, Button, EmptyState, Input, Skeleton, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { adminPlansQuery, usePlanActions } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { errorText, Modal } from '../components/Modal';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';

/** Багц (SPEC K, ADR-0059): the plans the portal offers. No delete: a plan is switched off. */
export function PlansPage() {
  const t = mn.plans;
  const list = useQuery(adminPlansQuery());
  const [editing, setEditing] = useState<AdminPlanDto | 'new'>();
  const plans = list.data?.plans ?? [];

  return (
    <>
      <PageHeader title={t.title} subtitle={t.lead}>
        <Button onClick={() => setEditing('new')}>{t.new}</Button>
      </PageHeader>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && plans.length === 0 ? (
        <EmptyState
          title={t.empty}
          action={<Button onClick={() => setEditing('new')}>{t.new}</Button>}
        />
      ) : null}
      {plans.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-visually-hidden">{t.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.columns.name}</th>
                <th scope="col">{t.columns.price}</th>
                <th scope="col">{t.columns.days}</th>
                <th scope="col">{t.columns.subscriptions}</th>
                <th scope="col">{t.columns.status}</th>
                <th scope="col">{t.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <strong>{plan.name}</strong>
                  </td>
                  <td>{formatMnt(plan.priceMnt)}</td>
                  <td>{t.days(plan.durationDays)}</td>
                  <td>{plan.subscriptionCount}</td>
                  <td>
                    <Badge tone={plan.active ? 'success' : 'neutral'}>
                      {plan.active ? t.active : t.inactive}
                    </Badge>
                  </td>
                  <td>
                    <Button variant="secondary" onClick={() => setEditing(plan)}>
                      {mn.common.edit}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={editing !== undefined}
        title={editing === 'new' ? t.formCreate : t.formEdit}
        onClose={() => setEditing(undefined)}
      >
        {editing ? (
          <PlanFields
            key={editing === 'new' ? 'new' : editing.id}
            editing={editing}
            onClose={() => setEditing(undefined)}
          />
        ) : null}
      </Modal>
    </>
  );
}

/** Whole tugrik or days from a text field; undefined when it is not a whole number. */
const wholeNumber = (text: string) => {
  const clean = text.replace(/[\s,]/g, '');
  return /^\d+$/.test(clean) ? Number(clean) : undefined;
};

function PlanFields({ editing, onClose }: { editing: AdminPlanDto | 'new'; onClose: () => void }) {
  const t = mn.plans;
  const toast = useToast();
  const { create, update } = usePlanActions();
  const existing = editing === 'new' ? undefined : editing;
  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing ? String(existing.priceMnt) : '');
  const [days, setDays] = useState(existing ? String(existing.durationDays) : '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string>();
  const pending = create.isPending || update.isPending;
  const daysLocked = (existing?.subscriptionCount ?? 0) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const priceMnt = wholeNumber(price);
    const durationDays = wholeNumber(days);
    const trimmed = name.trim();
    if (trimmed.length < 2 || priceMnt === undefined || durationDays === undefined) {
      setError(t.invalid);
      return;
    }
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          name: trimmed,
          priceMnt,
          active,
          ...(daysLocked ? {} : { durationDays }),
        });
      } else {
        await create.mutateAsync({ name: trimmed, priceMnt, durationDays, active });
      }
      toast.show(existing ? mn.common.saved : t.created, { tone: 'success' });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="admin-modal__body" onSubmit={(event) => void submit(event)} noValidate>
      <Input
        label={t.name}
        hint={t.nameHint}
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus
      />
      <Input
        label={t.price}
        hint={existing ? t.priceNote : t.priceHint(formatMnt(PLAN_PRICE_MIN_MNT))}
        value={price}
        inputMode="numeric"
        onChange={(event) => setPrice(event.target.value)}
        required
      />
      <Input
        label={t.durationDays}
        value={days}
        inputMode="numeric"
        onChange={(event) => setDays(event.target.value)}
        disabled={daysLocked}
        hint={daysLocked ? t.daysLocked : t.daysHint}
        required
      />
      <div>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>{t.activeLabel}</span>
        </label>
        <p className="admin-hint">{t.activeHint}</p>
      </div>
      {error ? (
        <p className="admin-hint admin-hint--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {mn.common.cancel}
        </Button>
        <Button type="submit" loading={pending}>
          {mn.common.save}
        </Button>
      </div>
    </form>
  );
}
