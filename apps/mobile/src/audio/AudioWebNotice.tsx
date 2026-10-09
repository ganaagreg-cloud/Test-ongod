import { StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { audioAvailable } from './engine';

/** Shown where a player would be when the audio engine is not available (browser preview). */
export function AudioWebNotice() {
  if (audioAvailable) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{mn.audioWebOnly}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  text: {
    color: colors.textSecondary,
    ...nativeTextStyle('body'),
  },
});
