import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { useBlockedUsers, useUnblock } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { useSubmit } from '../../../src/lib/useSubmit';
import { BackHeader } from '../../../src/screens/BackHeader';
import { Button, EmptyState, ListItem, Screen, Skeleton, useToast } from '../../../src/ui';

/** Хаасан хэрэглэгчид (SPEC L): who the user blocked in comments; a block can be undone here. */
export default function Blocked() {
  const toast = useToast();
  const blocked = useBlockedUsers();
  const unblock = useUnblock();
  const { run } = useSubmit();

  return (
    <Screen>
      <BackHeader title={mn.comments.blockedTitle} />
      <Text style={styles.text}>{mn.comments.blockedText}</Text>
      {blocked.data ? (
        blocked.data.users.length === 0 ? (
          <Text style={styles.text}>{mn.comments.blockedEmpty}</Text>
        ) : (
          <View style={styles.group}>
            {blocked.data.users.map((user) => (
              <ListItem
                key={user.id}
                title={user.name}
                value={mn.comments.unblock}
                icon="profile"
                onPress={() =>
                  void run(async () => {
                    await unblock.mutateAsync(user.id);
                    toast.show(mn.comments.unblocked, { tone: 'success' });
                  })
                }
              />
            ))}
          </View>
        )
      ) : blocked.isError ? (
        <EmptyState
          title={mn.episode.loadError}
          action={
            <Button
              label={mn.common.retry}
              variant="secondary"
              onPress={() => void blocked.refetch()}
            />
          }
        />
      ) : (
        <View style={styles.skeletons} aria-hidden>
          <Skeleton shape="block" height={layout.buttonHeight} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
  group: {
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  skeletons: { gap: spacing.sm },
});
