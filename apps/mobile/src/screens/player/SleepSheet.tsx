import { StyleSheet, Text, View } from 'react-native';
import { layout, nativeTextStyle, radius, type ThemeColors } from '@ongod/tokens';
import { SLEEP_MINUTES, type SleepMode } from '../../audio/sleepTimer';
import { mn } from '../../i18n/mn';
import { PressableScale, Sheet, useThemedStyles } from '../../ui';

/** "Унтах цаг": off, 15 / 30 / 45 minutes, or the end of the episode (DESIGN "Player"). */
export function SleepSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The running choice, or null when off. */
  value: SleepMode | null;
  onPick: (mode: SleepMode | null) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const options: Array<{ mode: SleepMode | null; label: string }> = [
    { mode: null, label: mn.player.sleepOff },
    ...SLEEP_MINUTES.map((minutes) => ({ mode: minutes, label: mn.player.sleepMinutes(minutes) })),
    { mode: 'end', label: mn.player.sleepEnd },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={mn.player.sleep} closeLabel={mn.close}>
      <View accessibilityRole="radiogroup">
        {options.map((option) => {
          const on = option.mode === value;
          return (
            <PressableScale
              key={String(option.mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onPick(option.mode)}
              scale={1}
              style={styles.option}
            >
              <Text style={styles.label}>{option.label}</Text>
              <View style={[styles.radio, on && styles.radioOn]} />
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    option: {
      minHeight: layout.buttonHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: layout.borderWidth,
      borderColor: c.hairline,
    },
    label: { color: c.textPrimary, ...nativeTextStyle('body') },
    radio: {
      width: layout.iconSize,
      height: layout.iconSize,
      borderRadius: radius.pill,
      borderWidth: layout.focusRingWidth,
      borderColor: c.hairlineStrong,
    },
    radioOn: { borderWidth: layout.iconSizeSmall / 2 - layout.borderWidth, borderColor: c.accent },
  });
