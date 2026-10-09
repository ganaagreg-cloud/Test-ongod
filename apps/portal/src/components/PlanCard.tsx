import type { ReactNode } from 'react';
import type { PlanDto } from '@ongod/shared';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';

/** A plan with its price. `children` is the call to action. */
export function PlanCard({
  plan,
  heading: Heading = 'h3',
  children,
}: {
  plan: PlanDto;
  /** h3 under a section heading (landing), h2 directly under the page title (plans page). */
  heading?: 'h2' | 'h3';
  children?: ReactNode;
}) {
  return (
    <article className="portal-plan" aria-label={plan.name}>
      <Heading className="portal-plan__name">{plan.name}</Heading>
      <p className="portal-plan__price">{formatMnt(plan.priceMnt)}</p>
      <p className="portal-plan__duration">{mn.plans.duration(plan.durationDays)}</p>
      {children}
    </article>
  );
}
