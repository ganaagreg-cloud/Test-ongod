import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import {
  layout,
  motion,
  nativeTextStyle,
  spacing,
  type CoverFamily,
  type ThemeColors,
} from '@ongod/tokens';
import { EpisodeThumb } from './EpisodeThumb';
import { Icon } from './Icon';
import { springs, useEnterStyle } from './motion';
import { useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export interface EpisodeRowProps {
  title: string;
  /** "category · year" */
  meta: string;
  coverUri?: string | null | undefined;
  /** "36:00" on the thumbnail. */
  durationLabel?: string | undefined;
  /** "№ 022" on the placeholder cover. */
  number?: string | undefined;
  family?: CoverFamily;
  /** Started episodes: value 0..1 (drawn on the thumbnail). */
  progress?: { value: number; label: string } | undefined;
  /** The saved bookmark; `label` names the action ("Хадгалах" / "Хадгалснаас хасах"). */
  save?: { saved: boolean; label: string; onToggle: () => void } | undefined;
  onPress?: (() => void) | undefined;
  /** Position in the list, for the staggered entrance. */
  index?: number;
}

/** Library row: 4:3 thumbnail, two-line title, meta, save icon that pops. */
export function EpisodeRow({
  title,
  meta,
  coverUri,
  durationLabel,
  number,
  family,
  progress,
  save,
  onPress,
  index = 0,
}: EpisodeRowProps) {
  const styles = useThemedStyles(makeStyles);
  const enter = useEnterStyle(index);
  const percent = progress ? Math.round(Math.min(1, Math.max(0, progress.value)) * 100) : 0;
  return (
    <Animated.View style={[styles.row, enter]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={progress ? `${title}. ${meta}. ${progress.label}` : `${title}. ${meta}`}
        accessibilityValue={progress ? { min: 0, max: 100, now: percent } : undefined}
        onPress={onPress}
        disabled={!onPress}
        style={styles.main}
      >
        <EpisodeThumb
          title={title}
          number={number}
          uri={coverUri}
          durationLabel={durationLabel}
          progress={progress?.value}
          {...(family && { family })}
        />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
      </PressableScale>
      {save ? <SaveButton {...save} /> : null}
    </Animated.View>
  );
}

function SaveButton({
  saved,
  label,
  onToggle,
}: {
  saved: boolean;
  label: string;
  onToggle: () => void;
}) {
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const pop = useSharedValue(1);
  const first = useSharedValue(true);
  useEffect(() => {
    // Pop when it becomes saved, not on first render.
    if (first.value) {
      first.value = false;
      return;
    }
    if (saved) {
      pop.value = withSequence(
        withSpring(motion.iconBounce * 1.2, springs.snappy),
        withSpring(1, springs.snappy),
      );
    }
  }, [saved, pop, first]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: saved }}
      onPress={onToggle}
      scale={motion.pressScaleRound}
      style={styles.save}
    >
      <Animated.View style={iconStyle}>
        <Icon
          name={saved ? 'bookmarkFilled' : 'bookmark'}
          color={saved ? colors.brand : colors.textSecondary}
        />
      </Animated.View>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    text: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeTextStyle('h1').fontFamily,
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('small') },
    save: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
