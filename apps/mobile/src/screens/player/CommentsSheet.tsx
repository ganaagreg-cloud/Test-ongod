import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMMENT_MAX_LENGTH,
  commentReportReasonSchema,
  type CommentDto,
  type CommentReportReason,
} from '@ongod/shared';
import {
  layout,
  motion,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { useCommentActions, useComments } from '../../data/queries';
import { mn } from '../../i18n/mn';
import { canSendComment, commentCharsLeft, commentsSummary } from '../../lib/comments';
import { formatDate } from '../../lib/format';
import { useSubmit } from '../../lib/useSubmit';
import {
  Button,
  Icon,
  ListItem,
  PressableScale,
  Sheet,
  Skeleton,
  SurfaceProvider,
  useSurface,
  useThemedStyles,
  useToast,
} from '../../ui';

type Menu = { comment: CommentDto; step: 'actions' | 'report' | 'block' | 'edit' };

/**
 * The full comments (SPEC L, ADR-0075): a tall Modal with the total and a close button on top, the
 * list in the middle and the writing box pinned at the bottom, moving up with the keyboard. Apple
 * 1.2: every other comment has Report and Block; your own have Edit and Delete. The box is there
 * only when the user may post; nothing explains why not.
 */
export function CommentsSheet({
  visible,
  onClose,
  episodeId,
  supportEmail,
}: {
  visible: boolean;
  onClose: () => void;
  episodeId: string;
  supportEmail: string | null;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Gestures inside a Modal need their own root view on Android. */}
      <GestureHandlerRootView style={fill.root}>
        <SurfaceProvider surface="dark">
          <Body onClose={onClose} episodeId={episodeId} supportEmail={supportEmail} />
        </SurfaceProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Body({
  onClose,
  episodeId,
  supportEmail,
}: {
  onClose: () => void;
  episodeId: string;
  supportEmail: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const insets = useSafeAreaInsets();
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
  const { total } = commentsSummary(pages);
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

  const empty = comments.isPending ? (
    <View style={styles.skeletons} aria-hidden>
      <Skeleton width="40%" />
      <Skeleton width="90%" />
    </View>
  ) : comments.isError ? (
    <Button label={mn.common.retry} variant="secondary" onPress={() => void comments.refetch()} />
  ) : (
    <Text style={styles.empty}>{mn.comments.empty}</Text>
  );

  return (
    <KeyboardAvoidingView style={fill.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={mn.close}
        />
      </View>
      <View style={[styles.panel, { marginTop: insets.top + spacing.xl }]} aria-modal>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {mn.comments.title}
            <Text style={styles.total}>{`  ${total}`}</Text>
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={mn.close}
            onPress={onClose}
            scale={motion.pressScaleRound}
            style={styles.closeButton}
          >
            <Icon name="close" color={colors.textSecondary} />
          </PressableScale>
        </View>

        <FlatList
          style={fill.root}
          contentContainerStyle={styles.list}
          data={items}
          keyExtractor={(comment) => comment.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={empty}
          renderItem={({ item: comment }) => (
            <View style={styles.item}>
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
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              {comments.hasNextPage ? (
                <Button
                  label={mn.comments.loadMore}
                  variant="secondary"
                  loading={comments.isFetchingNextPage}
                  onPress={() => void comments.fetchNextPage()}
                />
              ) : null}
              {supportEmail ? (
                <Text style={styles.contact}>{mn.comments.contact(supportEmail)}</Text>
              ) : null}
            </View>
          }
        />

        {canComment ? (
          <View style={[styles.compose, { paddingBottom: spacing.sm + insets.bottom }]}>
            <View style={styles.composeRow}>
              <TextInput
                accessibilityLabel={mn.comments.write}
                placeholder={mn.comments.placeholder}
                placeholderTextColor={colors.textTertiary}
                selectionColor={colors.focusRing}
                style={styles.composeInput}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={COMMENT_MAX_LENGTH}
              />
              <Button
                label={mn.comments.send}
                loading={pending && menu === null}
                disabled={!canSendComment(draft)}
                onPress={() => void send()}
              />
            </View>
            <Text style={styles.hint}>{left !== null ? String(left) : mn.comments.rules}</Text>
          </View>
        ) : null}
      </View>

      {/* Opens from inside this Modal: a nested Modal, to be checked on a phone. */}
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
              style={styles.editInput}
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
    </KeyboardAvoidingView>
  );
}

const fill = StyleSheet.create({ root: { flex: 1 } });

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: c.overlay },
    panel: {
      flex: 1,
      width: '100%',
      maxWidth: layout.overlayMaxWidth,
      alignSelf: 'center',
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      borderWidth: layout.borderWidth,
      borderBottomWidth: 0,
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingHorizontal: layout.screenPadding,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    title: { flex: 1, color: c.textPrimary, ...nativeTextStyle('h2') },
    total: { color: c.textSecondary, ...nativeTextStyle('body') },
    closeButton: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { gap: spacing.md, padding: layout.screenPadding },
    skeletons: { gap: spacing.md },
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
    footer: { gap: spacing.md },
    contact: { color: c.textTertiary, ...nativeTextStyle('caption') },
    compose: {
      gap: spacing.xs,
      paddingTop: spacing.sm,
      paddingHorizontal: layout.screenPadding,
      borderTopWidth: layout.borderWidth,
      borderTopColor: c.hairline,
      backgroundColor: c.surfaceRaised,
    },
    composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    composeInput: {
      flex: 1,
      minHeight: layout.inputHeight,
      maxHeight: layout.inputHeight * 3,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.cardLarge,
      backgroundColor: c.surfaceSunken,
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      textAlignVertical: 'top',
    },
    hint: { color: c.textTertiary, ...nativeTextStyle('caption') },
    editInput: {
      minHeight: layout.inputHeight,
      paddingVertical: spacing.sm,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairlineStrong,
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      textAlignVertical: 'top',
    },
    menu: {
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    sheetText: { color: c.textSecondary, ...nativeTextStyle('body') },
  });
