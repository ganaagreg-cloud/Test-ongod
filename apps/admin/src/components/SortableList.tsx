import { Button } from '@ongod/ui-web';
import { useState, type ReactNode } from 'react';
import { mn } from '../i18n/mn';

interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** Names the row's Up/Down buttons for screen readers; defaults to the id. */
  getLabel?: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  /** The new order: every id, first to last. */
  onReorder: (ids: string[]) => void;
  /** Blocks moves while a save is running. */
  disabled?: boolean;
  /** Extra controls on the right of each row (e.g. a remove button). */
  actions?: (item: T) => ReactNode;
}

/** Moves the item at `from` to the place of the item at `to`. */
export function moved(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * A reorderable list. Mouse: drag a row onto another (native HTML5 drag events). Keyboard and
 * touch: the Up/Down buttons, like the category page. Both end in the same `onReorder(ids)`.
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  render,
  onReorder,
  disabled = false,
  actions,
}: SortableListProps<T>) {
  const [dragId, setDragId] = useState<string>();
  const ids = items.map(getId);

  function move(from: number, to: number) {
    if (disabled || from === to || to < 0 || to >= ids.length) return;
    onReorder(moved(ids, from, to));
  }

  return (
    <ul className="admin-list">
      {items.map((item, index) => {
        const id = ids[index]!;
        const label = getLabel ? getLabel(item) : id;
        return (
          <li
            key={id}
            className={
              dragId === id ? 'admin-list__row admin-list__row--dragging' : 'admin-list__row'
            }
            draggable={!disabled}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
              setDragId(id);
            }}
            onDragOver={(event) => {
              if (dragId !== undefined) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId !== undefined) move(ids.indexOf(dragId), index);
              setDragId(undefined);
            }}
            onDragEnd={() => setDragId(undefined)}
          >
            <span className="admin-row-actions">
              <Button
                variant="ghost"
                aria-label={mn.sortable.moveUp(label)}
                disabled={disabled || index === 0}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                aria-label={mn.sortable.moveDown(label)}
                disabled={disabled || index === items.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </Button>
            </span>
            <span className="admin-list__main">{render(item, index)}</span>
            {actions ? <span className="admin-row-actions">{actions(item)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
