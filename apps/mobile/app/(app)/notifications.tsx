import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@ongod/shared';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { api } from '../../src/api';
import { keys, useNotifications } from '../../src/data/queries';
import { mn } from '../../src/i18n/mn';
import { formatDate } from '../../src/lib/format';
import { BackHeader } from '../../src/screens/BackHeader';
import { EmptyState, PressableScale, Screen, Skeleton, useThemedStyles } from '../../src/ui';

/**
 * Мэдэгдэл (ADR-0099): what the app pushed to this member, newest first; unread ones have a gold
 * dot. Opening the list marks everything read on the server; the list keeps showing which ones
 * were new until it is left, then the dot on the bell is gone. A "new episode" row opens it.
 */
export default function Notifications() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useNotifications();
  const unread = list.data?.unread ?? 0;

  useEffect(() => {
    if (unread > 0) void api.markNotificationsRead().catch(() => undefined);
  }, [unread]);
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: keys.notifications });
    },
    [queryClient],
  );

  const open = (item: NotificationDto) => {
    if (item.episodeId) router.push({ pathname: '/player/[id]', params: { id: item.episodeId } });
  };

  return (
    <Screen>
      <BackHeader title={mn.notifications.title} />
      {list.isPending ? <Skeleton height={layout.touchTarget * 2} /> : null}
      {list.isError ? <Text style={styles.text}>{mn.notifications.loadFailed}</Text> : null}
      {list.data && list.data.items.length === 0 ? (
        <EmptyState title={mn.notifications.emptyTitle} text={mn.notifications.emptyText} />
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <View style={styles.group}>
          {list.data.items.map((item) => (
            <PressableScale
              key={item.id}
              accessibilityRole={item.episodeId ? 'button' : 'text'}
              accessibilityLabel={`${item.title}. ${item.body}`}
              accessibilityHint={item.episodeId ? mn.notifications.opens : undefined}
              disabled={!item.episodeId}
              onPress={() => open(item)}
              style={styles.row}
            >
              <View style={[styles.dot, item.read && styles.dotRead]} />
              <View style={styles.text}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    text: { flex: 1, gap: spacing.xxs, color: c.textSecondary, ...nativeTextStyle('body') },
    group: {
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    dot: {
      width: layout.dotSize,
      height: layout.dotSize,
      marginTop: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
    },
    dotRead: { backgroundColor: 'transparent' },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    body: { color: c.textSecondary, ...nativeTextStyle('small') },
    date: { color: c.textTertiary, ...nativeTextStyle('caption') },
  });
