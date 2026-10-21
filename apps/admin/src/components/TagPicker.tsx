import { useQuery } from '@tanstack/react-query';
import { Chip, Input, Notice } from '@ongod/ui-web';
import { useState, type KeyboardEvent } from 'react';
import { tagsQuery, useTagActions } from '../api/queries';
import { mn } from '../i18n/mn';
import { errorText } from './Modal';

/** The server takes at most this many tags per item. */
const MAX_TAGS = 20;

interface TagPickerProps {
  /** Tag ids. */
  value: string[];
  onChange: (value: string[]) => void;
}

/** Type to filter the tags; Enter picks the match, or creates a new tag when there is none. */
export function TagPicker({ value, onChange }: TagPickerProps) {
  const t = mn.episodes.tagPicker;
  const tags = useQuery(tagsQuery());
  const { create } = useTagActions();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const all = tags.data?.tags ?? [];
  const byId = new Map(all.map((tag) => [tag.id, tag]));
  const needle = text.trim().toLowerCase();
  const suggestions = all
    .filter((tag) => !value.includes(tag.id) && tag.name.toLowerCase().includes(needle))
    .slice(0, 12);
  const full = value.length >= MAX_TAGS;

  const add = (id: string) => {
    setError(undefined);
    if (!value.includes(id)) onChange([...value, id]);
    setText('');
  };

  async function enter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter must not submit the surrounding form.
    event.preventDefault();
    const name = text.trim();
    if (!name || create.isPending) return;
    if (full) {
      setError(t.limit);
      return;
    }
    const existing = all.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      add(existing.id);
      return;
    }
    try {
      const { tag } = await create.mutateAsync({ name });
      add(tag.id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="admin-tags">
      <Input
        label={mn.episodes.form.tags}
        placeholder={t.filterLabel}
        value={text}
        maxLength={100}
        hint={t.hint}
        disabled={create.isPending}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => void enter(event)}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ul className="admin-tags__list" aria-label={t.selected}>
        {value.length === 0 ? <li className="admin-hint">{t.none}</li> : null}
        {value.map((id) => {
          const name = byId.get(id)?.name ?? id;
          return (
            <li key={id}>
              <Chip
                selected
                aria-label={t.remove(name)}
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                {name} ×
              </Chip>
            </li>
          );
        })}
      </ul>
      {suggestions.length > 0 && !full ? (
        <ul className="admin-tags__list" aria-label={t.suggestions}>
          {suggestions.map((tag) => (
            <li key={tag.id}>
              <Chip onClick={() => add(tag.id)}>{tag.name}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
