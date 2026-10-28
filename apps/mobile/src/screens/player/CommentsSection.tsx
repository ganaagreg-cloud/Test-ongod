import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  COMMENT_MAX_LENGTH,
  commentReportReasonSchema,
  type CommentDto,
  type CommentReportReason,
} from '@ongod/shared';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { useCommentActions, useComments } from '../../data/queries';
import { mn } from '../../i18n/mn';
import { canSendComment, commentCharsLeft } from '../../lib/comments';
import { formatDate } from '../../lib/format';
import { useSubmit } from '../../lib/useSubmit';
import {
  Button,
  Icon,
  ListItem,
  PressableScale,
  Sheet,
  Skeleton,
  useSurface,
  useThemedStyles,
  useToast,
} from '../../ui';

type Menu = { comment: CommentDto; step: 'actions' | 'report' | 'block' | 'edit' };

/**
 * "Сэтгэгдэл" under the Player (SPEC L, ADR-0061). Shown only when the server publishes a support
 * contact (Apple 1.2). The box is there only when the user may post; nothing explains why not.
 * Apple 1.2: every other comment has Report and Block; your own have Edit and Delete.
 */
export function CommentsSection({
  episodeId,
  supportEmail,
}: {
  episodeId: string;
  supportEmail: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const toast = useToast();
  const comments = useComments(episodeId);
  const actions = useCommentActions(episodeId);
  const { pending, run } = useSubmit();
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editText, setEditText] = useState('');

  const pages = comments.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const canComment = pages[0]?.canComment ?? false;
  const left = commentCharsLeft(draft);

  async function send() {
    if (!canSendComment(draft)) return;
    const ok = await run(() => actions.post.mutateAsync(draft.trim()));
    if (ok) {
      setDraft('');
      toast.show(mn.comments.sent, { tone: 'success' });
    }
  }

  const close = () => setMenu(null);

  async function report(reason: CommentReportReason) {
    if (!menu) return;
    const ok = await run(() => actions.report.mutateAsync({ id: menu.comment.id, reason }));
    if (ok) {
      close();
      toast.show(mn.comments.reported, { tone: 'success' });
    }
  }

  async function block() {
    if (!menu) return;
    const ok = await run(() => actions.block.mutateAsync(menu.comment.id));
    if (ok) {
      close();
      toast.show(mn.comments.blocked, { tone: 'success' });
    }
  }

  async function remove() {
    if (!menu) return;
    const ok = await run(() => actions.remove.mutateAsync(menu.comment.id));
    if (ok) {
      close();
      toast.show(mn.comments.deleted);
    }
  }

  async function saveEdit() {
    if (!menu || !canSendComment(editText)) return;
    const ok = await run(() =>
      actions.edit.mutateAsync({ id: menu.comment.id, body: editText.trim() }),
    );
    if (ok) close();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {mn.comments.title}
      </Text>

      {canComment ? (
        <View style={styles.compose}>
          <TextInput
            accessibilityLabel={mn.comments.write}
            placeholder={mn.comments.placeholder}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.focusRing}
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={COMMENT_MAX_LENGTH}
          />
          <View style={styles.composeRow}>
            <Text style={styles.hint}>{left !== null ? String(left) : mn.comments.rules}</Text>
            <Button
              label={mn.comments.send}
              loading={pending && menu === null}
              disabled={!canSendComment(draft)}
              onPress={() => void send()}
            />
          </View>
        </View>
      ) : null}

      {comments.isPending ? (
        <View style={styles.list} aria-hidden>
          <Skeleton width="40%" />
          <Skeleton width="90%" />
        </View>
      ) : comments.isError ? (
        <Button
          label={mn.common.retry}
          variant="secondary"
          onPress={() => void comments.refetch()}
        />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{mn.comments.empty}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((comment) => (
            <View key={comment.id} style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.name} numberOfLines={1}>
                  {comment.mine ? mn.comments.mine : comment.authorName}
                </Text>
                <Text style={styles.date}>
                  {formatDate(comment.createdAt)}
                  {comment.edited ? ` · ${mn.comments.edited}` : ''}
                </Text>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={mn.comments.more}
                  onPress={() => {
                    setEditText(comment.body);
                    setMenu({ comment, step: 'actions' });
                  }}
                  style={styles.moreButton}
                >
                  <Icon name="more" size="small" color={colors.textSecondary} />
                </PressableScale>
              </View>
              <Text style={styles.body}>{comment.body}</Text>
            </View>
          ))}
          {comments.hasNextPage ? (
            <Button
              label={mn.comments.loadMore}
              variant="secondary"
              loading={comments.isFetchingNextPage}
              onPress={() => void comments.fetchNextPage()}
            />
          ) : null}
        </View>
      )}

      <Text style={styles.contact}>{mn.comments.contact(supportEmail)}</Text>

      <Sheet
        visible={menu !== null}
        onClose={close}
        title={
          menu?.step === 'report'
            ? mn.comments.reportTitle
            : menu?.step === 'block'
              ? mn.comments.blockTitle
              : menu?.step === 'edit'
                ? mn.comments.edit
                : mn.comments.title
        }
        closeLabel={mn.close}
      >
        {menu?.step === 'actions' ? (
          <View style={styles.menu}>
            {menu.comment.mine ? (
              <>
                <ListItem
                  title={mn.comments.edit}
                  icon="edit"
                  onPress={() => setMenu({ ...menu, step: 'edit' })}
                />
                <ListItem
                  title={mn.comments.delete}
                  icon="trash"
                  tone="destructive"
                  onPress={() => void remove()}
                />
              </>
            ) : (
              <>
                <ListItem
                  title={mn.comments.report}
                  icon="alert"
                  onPress={() => setMenu({ ...menu, step: 'report' })}
                />
                <ListItem
                  title={mn.comments.block}
                  icon="profile"
                  onPress={() => setMenu({ ...menu, step: 'block' })}
                />
              </>
            )}
          </View>
        ) : null}
        {menu?.step === 'report' ? (
          <View style={styles.menu}>
            {commentReportReasonSchema.options.map((reason) => (
              <ListItem
                key={reason}
                title={mn.comments.reasons[reason]}
                onPress={() => void report(reason)}
              />
            ))}
          </View>
        ) : null}
        {menu?.step === 'block' ? (
          <>
            <Text style={styles.sheetText}>{mn.comments.blockText}</Text>
            <Button
              label={mn.comments.block}
              variant="destructive"
              fullWidth
              loading={pending}
              onPress={() => void block()}
            />
            <Button label={mn.comments.cancel} variant="secondary" fullWidth onPress={close} />
          </>
        ) : null}
        {menu?.step === 'edit' ? (
          <>
            <TextInput
              accessibilityLabel={mn.comments.edit}
              placeholderTextColor={colors.textTertiary}
              selectionColor={colors.focusRing}
              style={styles.input}
              value={editText}
              onChangeText={setEditText}
              multiline
              maxLength={COMMENT_MAX_LENGTH}
            />
            <Button
              label={mn.comments.save}
              fullWidth
              loading={pending}
              disabled={!canSendComment(editText)}
              onPress={() => void saveEdit()}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
      gap: spacing.md,
    },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    compose: { gap: spacing.xs },
    input: {
      minHeight: layout.inputHeight,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      backgroundColor: c.surface,
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      textAlignVertical: 'top',
    },
    composeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    hint: { flexShrink: 1, color: c.textTertiary, ...nativeTextStyle('caption') },
    list: { gap: spacing.md },
    empty: { color: c.textSecondary, ...nativeTextStyle('small') },
    item: { gap: spacing.xxs },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    name: {
      flexShrink: 1,
      color: c.textPrimary,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
    date: { flex: 1, color: c.textTertiary, ...nativeTextStyle('caption') },
    moreButton: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { color: c.textPrimary, ...nativeTextStyle('body') },
    contact: { color: c.textTertiary, ...nativeTextStyle('caption') },
    menu: {
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    sheetText: { color: c.textSecondary, ...nativeTextStyle('body') },
  });
