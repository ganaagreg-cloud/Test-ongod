import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, layout, nativeTextStyle, spacing } from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { reportError } from '../../monitoring/sentry';
import { pushEnabled, pushIsAvailable, setPushEnabled } from '../../push/push';
import { haptic, Icon } from '../../ui';

/**
 * The last row of the Профайл menu (Profile.dc.html): bell, "Мэдэгдэл", a switch. Per phone
 * (ADR-0055). Hidden where push cannot work (Expo Go, web, simulator, no EAS project).
 */
export function PushSwitch() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Read on every focus: the person may have changed it in the system settings meanwhile.
  useFocusEffect(
    useCallback(() => {
      void pushEnabled().then(setOn, reportError);
    }, []),
  );

  if (!pushIsAvailable) return null;

  const toggle = (next: boolean) => {
    haptic.light();
    setOn(next);
    setBusy(true);
    setPushEnabled(next)
      .then((result) => setOn(result === 'on'))
      .catch((error: unknown) => {
        reportError(error);
        setOn(!next);
      })
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.row}>
      <Icon name="bell" color={colors.textPrimary} />
      <Text style={styles.title} nativeID="push-switch-label">
        {mn.profile.notifications}
      </Text>
      <Switch
        accessibilityLabel={mn.profile.notifications}
        accessibilityLabelledBy="push-switch-label"
        value={on}
        disabled={busy}
        onValueChange={toggle}
        trackColor={{ false: colors.surfaceSunken, true: colors.accent }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor={colors.surfaceSunken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  title: { flex: 1, color: colors.textPrimary, ...nativeTextStyle('body') },
});
