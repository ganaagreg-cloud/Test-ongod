import type { ReactNode } from 'react';
import type { PlanDto } from '@ongod/shared';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';

/** Monthly price shown under plans of two months or longer ("Сард ойролцоогоор 8,300₮"). */
export function perMonth(plan: PlanDto): string | null {
  if (plan.durationDays < 60) return null;
  return formatMnt(Math.round((plan.priceMnt * 30) / plan.durationDays / 100) * 100);
}

/** A plan: name, price and length on a forest panel, what it includes and the call to action. */
export function PlanCard({
  plan,
  heading: Heading = 'h3',
  children,
}: {
  plan: PlanDto;
  /** h3 under a section heading (landing), h2 directly under the page title (plans page). */
  heading?: 'h2' | 'h3';
  /** The call to action. */
  children?: ReactNode;
}) {
  const monthly = perMonth(plan);
  return (
    <article className="portal-plan" aria-label={plan.name}>
      <div className="portal-plan__head">
        <Heading className="portal-plan__name">{plan.name}</Heading>
        <p className="portal-plan__price">{formatMnt(plan.priceMnt)}</p>
        <p className="portal-plan__duration">{mn.plans.duration(plan.durationDays)}</p>
        {monthly ? <p className="portal-plan__duration">{mn.plans.perMonth(monthly)}</p> : null}
      </div>
      <div className="portal-plan__body">
        <ul className="portal-plan__includes">
          {mn.plans.includes.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {children}
      </div>
    </article>
  );
}
