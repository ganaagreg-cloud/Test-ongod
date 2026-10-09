import { StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { MountainLine } from '../ui';

/** Top of an auth screen: the mountain line (allowed on auth screens), title, optional text. */
export function AuthHeader({ title, text }: { title: string; text?: string | undefined }) {
  return (
    <View style={styles.box}>
      <MountainLine />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, ...nativeTextStyle('display') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
