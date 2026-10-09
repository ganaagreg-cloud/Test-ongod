import { useQuery } from '@tanstack/react-query';
import type { AdminCategoryDto } from '@ongod/shared';
import { Button, EmptyState, Input, Skeleton, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { categoriesQuery, useCategoryActions } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { ConfirmDialog, errorText, Modal } from '../components/Modal';
import { suggestSlug } from '../lib/format';
import { mn } from '../i18n/mn';

export function CategoriesPage() {
  const t = mn.categories;
  const toast = useToast();
  const list = useQuery(categoriesQuery());
  const { remove, reorder } = useCategoryActions();
  const [editing, setEditing] = useState<AdminCategoryDto | 'new'>();
  const [deleting, setDeleting] = useState<AdminCategoryDto>();

  const categories = list.data?.categories ?? [];

  function move(index: number, by: -1 | 1) {
    const ids = categories.map((category) => category.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onSuccess: () => toast.show(t.reordered, { tone: 'success' }) });
  }

  return (
    <>
      <PageHeader title={t.title}>
        <Button onClick={() => setEditing('new')}>{t.new}</Button>
      </PageHeader>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && categories.length === 0 ? (
        <EmptyState
          title={t.empty}
          action={<Button onClick={() => setEditing('new')}>{t.new}</Button>}
        />
      ) : null}
      {categories.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-visually-hidden">{t.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.columns.order}</th>
                <th scope="col">{t.columns.name}</th>
                <th scope="col">{t.columns.slug}</th>
                <th scope="col">{t.columns.episodes}</th>
                <th scope="col">{t.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, index) => (
                <tr key={category.id}>
                  <td>
                    <span className="admin-row-actions">
                      <Button
                        variant="ghost"
                        aria-label={t.moveUp(category.name)}
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={t.moveDown(category.name)}
                        disabled={index === categories.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                    </span>
                  </td>
                  <td>
                    <strong>{category.name}</strong>
                  </td>
                  <td>
                    <code className="admin-code">{category.slug}</code>
                  </td>
                  <td>{category.episodeCount}</td>
                  <td>
                    <span className="admin-row-actions">
                      <Button variant="secondary" onClick={() => setEditing(category)}>
                        {mn.common.edit}
                      </Button>
                      <Button variant="secondary" onClick={() => setDeleting(category)}>
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

      <CategoryForm editing={editing} onClose={() => setEditing(undefined)} />
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

function CategoryForm({
  editing,
  onClose,
}: {
  editing: AdminCategoryDto | 'new' | undefined;
  onClose: () => void;
}) {
  return (
    <Modal
      open={editing !== undefined}
      title={editing === 'new' ? mn.categories.formCreate : mn.categories.formEdit}
      onClose={onClose}
    >
      {editing ? (
        <CategoryFields
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function CategoryFields({
  editing,
  onClose,
}: {
  editing: AdminCategoryDto | 'new';
  onClose: () => void;
}) {
  const t = mn.categories;
  const toast = useToast();
  const { create, update } = useCategoryActions();
  const existing = editing === 'new' ? undefined : editing;
  const [name, setName] = useState(existing?.name ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  // The slug follows the name until the admin edits it by hand.
  const [slugTouched, setSlugTouched] = useState(existing !== undefined);
  const [error, setError] = useState<string>();
  const pending = create.isPending || update.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      if (existing) await update.mutateAsync({ id: existing.id, name: name.trim(), slug });
      else await create.mutateAsync({ name: name.trim(), slug });
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
        onChange={(event) => {
          setName(event.target.value);
          if (!slugTouched) setSlug(suggestSlug(event.target.value));
        }}
        required
        autoFocus
      />
      <Input
        label={t.slug}
        hint={t.slugHint}
        value={slug}
        maxLength={60}
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.target.value);
        }}
        required
        {...(error ? { error } : {})}
      />
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {mn.common.cancel}
        </Button>
        <Button type="submit" loading={pending} disabled={name.trim() === '' || slug.length < 2}>
          {mn.common.save}
        </Button>
      </div>
    </form>
  );
}
