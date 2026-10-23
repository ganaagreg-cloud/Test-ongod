// Shown when playback is refused because access is not active (DESIGN "No-access state",
// NoAccess.dc.html). Store-safe: one button that re-reads the access, nothing else. NO price, NO
// link, NO payment text (ADR-0006); the one exception is the plain activate line (ADR-0044).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  layout,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';
import { accessState } from '../lib/episode';
import { formatDate } from '../lib/format';
import { Button, haptic, Icon, Sheet, useSurface, useThemedStyles } from '../ui';

type Phase = 'idle' | 'busy' | 'still' | 'ok';

const SHAKE_MS = 60;

export function NoAccessSheet({
  visible,
  onClose,
  onPlay,
}: {
  visible: boolean;
  onClose: () => void;
  /** "Тоглуулах" after the access turned out to be active. */
  onPlay: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const { refreshUser } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [until, setUntil] = useState<string | null>(null);
  const shake = useSharedValue(0);
  const burst = useSharedValue(0);

  // Each time the sheet opens it starts over.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPhase('idle');
  }

  const check = async () => {
    if (phase === 'busy') return;
    setPhase('busy');
    try {
      const me = await refreshUser();
      if (me && accessState(me.accessUntil, new Date()).active) {
        setUntil(me.accessUntil);
        setPhase('ok');
        haptic.success();
        burst.value = 0;
        burst.value = withTiming(1, { duration: 600, reduceMotion: ReduceMotion.System });
        return;
      }
    } catch {
      // No connection: same answer as "not yet"; the button stays to try again.
    }
    setPhase('still');
    haptic.error();
    const step = (to: number) =>
      withTiming(to, { duration: SHAKE_MS, reduceMotion: ReduceMotion.System });
    shake.value = withSequence(step(-spacing.xs), step(spacing.xs), step(-spacing.xxs), step(0));
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: 1 - burst.value,
    transform: [{ scale: 1 + burst.value * 0.6 }],
  }));

  const ok = phase === 'ok';
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={ok ? mn.noAccess.activeTitle : mn.noAccess.title}
      closeLabel={mn.close}
    >
      <View style={styles.center}>
        <View style={styles.badgeBox}>
          {ok ? <Animated.View style={[styles.ring, burstStyle]} /> : null}
          <View style={[styles.badge, ok ? styles.badgeOk : styles.badgeWait]}>
            <Icon name={ok ? 'check' : 'info'} color={ok ? colors.success : colors.accent} />
          </View>
        </View>
        {ok ? null : <Text style={styles.text}>{mn.noAccess.activate}</Text>}
        <Text style={styles.text}>
          {ok && until ? mn.noAccess.activeText(formatDate(until)) : mn.noAccess.text}
        </Text>
        {phase === 'still' ? (
          <Text style={styles.warning} accessibilityRole="alert">
            {mn.noAccess.still}
          </Text>
        ) : null}
      </View>
      {ok ? (
        <Button label={mn.noAccess.play} icon="play" fullWidth onPress={onPlay} />
      ) : (
        <Animated.View style={shakeStyle}>
          <Button
            label={phase === 'busy' ? mn.noAccess.checking : mn.noAccess.check}
            loading={phase === 'busy'}
            fullWidth
            onPress={() => void check()}
          />
        </Animated.View>
      )}
    </Sheet>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    center: { alignItems: 'center', gap: spacing.sm },
    badgeBox: {
      width: layout.iconTile + spacing.xl,
      height: layout.iconTile + spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      width: layout.iconTile + spacing.xl,
      height: layout.iconTile + spacing.xl,
      borderRadius: radius.pill,
      borderWidth: layout.borderWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeWait: { backgroundColor: c.accentSoft, borderColor: withAlpha(c.accent, 0.35) },
    badgeOk: {
      backgroundColor: withAlpha(c.success, 0.16),
      borderColor: withAlpha(c.success, 0.5),
    },
    ring: {
      ...StyleSheet.absoluteFill,
      borderRadius: radius.pill,
      borderWidth: layout.focusRingWidth,
      borderColor: c.success,
    },
    text: { color: c.textSecondary, textAlign: 'center', ...nativeTextStyle('body') },
    warning: {
      color: c.warning,
      backgroundColor: withAlpha(c.warning, 0.12),
      borderRadius: radius.card,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      overflow: 'hidden',
      ...nativeTextStyle('small'),
    },
  });
