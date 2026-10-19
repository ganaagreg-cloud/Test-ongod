import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { layout, motion, nativeTextStyle, spacing, type ThemeColors } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { Icon, PressableScale, useSurface, useThemedStyles } from '../ui';

/** Title row of a pushed page (Тохиргоо and its sub-pages): back chevron + title. */
export function BackHeader({ title }: { title: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const router = useRouter();
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.back}
        onPress={() => router.back()}
        scale={motion.pressScaleRound}
        style={styles.back}
      >
        <Icon name="chevronLeft" color={colors.textPrimary} />
      </PressableScale>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    back: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      marginLeft: -spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { flex: 1, color: c.textPrimary, ...nativeTextStyle('display') },
  });
