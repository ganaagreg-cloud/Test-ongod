import { useQuery } from '@tanstack/react-query';
import type { AdminTagDto } from '@ongod/shared';
import { Button, EmptyState, Input, Skeleton, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { tagsQuery, useTagActions } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { ConfirmDialog, errorText, Modal } from '../components/Modal';
import { mn } from '../i18n/mn';

export function TagsPage() {
  const t = mn.tags;
  const toast = useToast();
  const list = useQuery(tagsQuery());
  const { remove } = useTagActions();
  const [editing, setEditing] = useState<AdminTagDto | 'new'>();
  const [deleting, setDeleting] = useState<AdminTagDto>();

  const tags = list.data?.tags ?? [];

  return (
    <>
      <PageHeader title={t.title}>
        <Button onClick={() => setEditing('new')}>{t.new}</Button>
      </PageHeader>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && tags.length === 0 ? (
        <EmptyState
          title={t.empty}
          action={<Button onClick={() => setEditing('new')}>{t.new}</Button>}
        />
      ) : null}
      {tags.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-visually-hidden">{t.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.columns.name}</th>
                <th scope="col">{t.columns.slug}</th>
                <th scope="col">{t.columns.episodes}</th>
                <th scope="col">{t.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <strong>{tag.name}</strong>
                  </td>
                  <td>
                    <code className="admin-code">{tag.slug}</code>
                  </td>
                  <td>{tag.episodeCount}</td>
                  <td>
                    <span className="admin-row-actions">
                      <Button variant="secondary" onClick={() => setEditing(tag)}>
                        {mn.common.edit}
                      </Button>
                      <Button variant="secondary" onClick={() => setDeleting(tag)}>
                        {mn.common.delete}
                      </Button>
                    </span>
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
          <TagFields
            key={editing === 'new' ? 'new' : editing.id}
            editing={editing}
            onClose={() => setEditing(undefined)}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={deleting !== undefined}
        title={t.deleteTitle}
        text={deleting ? t.deleteText(deleting.name) : undefined}
        confirmLabel={mn.common.delete}
        tone="destructive"
        onClose={() => setDeleting(undefined)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.show(t.deleted, { tone: 'success' });
        }}
      />
    </>
  );
}

function TagFields({ editing, onClose }: { editing: AdminTagDto | 'new'; onClose: () => void }) {
  const t = mn.tags;
  const toast = useToast();
  const { create, update } = useTagActions();
  const existing = editing === 'new' ? undefined : editing;
  const [name, setName] = useState(existing?.name ?? '');
  const [error, setError] = useState<string>();
  const pending = create.isPending || update.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      if (existing) await update.mutateAsync({ id: existing.id, name: name.trim() });
      else await create.mutateAsync({ name: name.trim() });
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
        value={name}
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
        required
        autoFocus
        {...(error ? { error } : {})}
      />
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {mn.common.cancel}
        </Button>
        <Button type="submit" loading={pending} disabled={name.trim() === ''}>
          {mn.common.save}
        </Button>
      </div>
    </form>
  );
}
