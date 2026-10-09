import { cx } from './cx';
import { Icon } from './Icon';

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  label: string;
  state: TimelineState;
  /** Optional second line under the label. */
  text?: string | undefined;
}

/**
 * Vertical status timeline (portal "Submitted": Хүлээгдэж байна → Шалгаж байна → Идэвхжсэн).
 * `stateLabels` are read out by screen readers next to each label, so state never relies on color.
 */
export function Timeline({
  steps,
  stateLabels,
  className,
}: {
  steps: TimelineStep[];
  stateLabels: Record<TimelineState, string>;
  className?: string;
}) {
  return (
    <ol className={cx('ui-timeline', className)}>
      {steps.map((step) => (
        <li
          key={step.label}
          className={cx('ui-timeline__step', `is-${step.state}`)}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="ui-timeline__marker" aria-hidden="true">
            {step.state === 'done' ? <Icon name="check" size="small" /> : null}
          </span>
          <span className="ui-timeline__body">
            <span className="ui-timeline__label">{step.label}</span>
            <span className="ui-visually-hidden"> ({stateLabels[step.state]})</span>
            {step.text ? <span className="ui-timeline__text">{step.text}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
