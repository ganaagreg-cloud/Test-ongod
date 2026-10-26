import type { IconName } from '@ongod/tokens';
import { Icon } from '@ongod/ui-web';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface MenuProps {
  /** Names the button for screen readers (an icon alone has no name). */
  label: string;
  /** Button content; the "more" icon by default. */
  trigger?: ReactNode;
  icon?: IconName;
  align?: 'start' | 'end';
  /** Which way the list opens; "up" for a button at the bottom of the page. */
  side?: 'down' | 'up';
  /** Replaces the default square icon-button look of the trigger. */
  triggerClassName?: string;
  /** The menu items; call `close` when one is chosen. */
  children: (close: () => void) => ReactNode;
}

/** A small dropdown: Esc and a click outside close it. A click inside never reaches the table row. */
export function Menu({
  label,
  trigger,
  icon = 'more',
  align = 'end',
  side = 'down',
  triggerClassName,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <span
      ref={root}
      className="admin-menu"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={triggerClassName ?? 'admin-menu__trigger'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? <Icon name={icon} size="small" />}
      </button>
      {open ? (
        <span
          id={id}
          role="menu"
          className={`admin-menu__list admin-menu__list--${align}${side === 'up' ? ' admin-menu__list--up' : ''}`}
        >
          {children(() => setOpen(false))}
        </span>
      ) : null}
    </span>
  );
}

export function MenuItem({
  onClick,
  tone,
  disabled,
  children,
}: {
  onClick: () => void;
  tone?: 'danger';
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={
        tone === 'danger' ? 'admin-menu__item admin-menu__item--danger' : 'admin-menu__item'
      }
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
