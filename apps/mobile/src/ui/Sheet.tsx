import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, motion, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { Icon } from './Icon';
import { useReduceMotion } from './useReduceMotion';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/** Bottom sheet: dimmed overlay, 20 pt top radius, handle. Android back and a tap outside close it. */
export function Sheet({ visible, onClose, title, closeLabel, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  // Mount before the slide-in starts (adjusting state during render is the supported pattern).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const duration = reduceMotion ? 0 : motion.durationMs;
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !visible) setMounted(false);
      },
    );
  }, [visible, reduceMotion, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [spacing.huge * 4, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
        />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          aria-modal
          style={[
            styles.panel,
            { paddingBottom: spacing.xl + insets.bottom, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  panel: {
    width: '100%',
    maxWidth: layout.overlayMaxWidth,
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: layout.borderWidth,
    borderBottomWidth: 0,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRaised,
  },
  handle: {
    alignSelf: 'center',
    width: layout.sheetHandleWidth,
    height: layout.sheetHandleHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flex: 1, color: colors.textPrimary, ...nativeTextStyle('h2') },
  close: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: spacing.md },
});
