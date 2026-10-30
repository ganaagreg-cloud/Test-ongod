import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { useComments } from '../../data/queries';
import { mn } from '../../i18n/mn';
import { commentsSummary } from '../../lib/comments';
import { Button, PressableScale, Skeleton, useThemedStyles } from '../../ui';
import { CommentsSheet } from './CommentsSheet';

/**
 * "Сэтгэгдэл" under the Player (SPEC L, ADR-0075): one small card with the total and the newest
 * comment; the list and the writing box open in a tall sheet. Shown only when the server publishes
 * a support contact (Apple 1.2).
 */
export function CommentsSection({
  episodeId,
  supportEmail,
}: {
  episodeId: string;
  supportEmail: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const comments = useComments(episodeId);
  const [open, setOpen] = useState(false);
  const { total, newest } = commentsSummary(comments.data?.pages ?? []);

  return (
    <View style={styles.block}>
      {comments.isPending ? (
        <View style={styles.card} aria-hidden>
          <Skeleton width="40%" />
          <Skeleton width="90%" />
        </View>
      ) : comments.isError ? (
        <Button
          label={mn.common.retry}
          variant="secondary"
          onPress={() => void comments.refetch()}
        />
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={mn.comments.open(total)}
          onPress={() => setOpen(true)}
          style={styles.card}
        >
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">
              {mn.comments.title}
            </Text>
            <Text style={styles.total}>{total}</Text>
          </View>
          {newest ? (
            <Text style={styles.preview} numberOfLines={2}>
              <Text style={styles.name}>{newest.mine ? mn.comments.mine : newest.authorName}</Text>
              {`  ${newest.body}`}
            </Text>
          ) : (
            <Text style={styles.placeholder}>{mn.comments.placeholder}</Text>
          )}
        </PressableScale>
      )}

      {supportEmail ? (
        <Text style={styles.contact}>{mn.comments.contact(supportEmail)}</Text>
      ) : null}

      <CommentsSheet
        visible={open}
        onClose={() => setOpen(false)}
        episodeId={episodeId}
        supportEmail={supportEmail}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    block: {
      paddingTop: spacing.md,
      borderTopWidth: layout.borderWidth,
      borderTopColor: c.hairline,
      gap: spacing.md,
    },
    card: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.card,
      backgroundColor: c.surfaceSunken,
    },
    head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    total: { color: c.textSecondary, ...nativeTextStyle('small') },
    preview: { color: c.textPrimary, ...nativeTextStyle('small') },
    name: { fontFamily: nativeFontFamily.ui[600] },
    placeholder: { color: c.textTertiary, ...nativeTextStyle('small') },
    contact: { color: c.textTertiary, ...nativeTextStyle('caption') },
  });
