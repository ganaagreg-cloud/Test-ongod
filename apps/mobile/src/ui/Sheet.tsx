import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, motion, nativeTextStyle, radius, spacing, type ThemeColors } from '@ongod/tokens';
import { haptic } from './haptics';
import { Icon } from './Icon';
import { springs } from './motion';
import { SurfaceProvider, useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * Bottom sheet: backdrop that fades with the drag, 26 pt top radius, handle. Springs up
 * (spring.sheet); drag it down past 30% of its height, or fling it, to dismiss. Android back and a
 * tap outside close it too. Sheets are always dark (listening surface).
 */
export function Sheet(props: SheetProps) {
  const { visible } = props;
  const [mounted, setMounted] = useState(visible);
  // Mount before the slide-in starts (adjusting state during render is the supported pattern).
  if (visible && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      {/* Gestures inside a Modal need their own root view on Android. */}
      <GestureHandlerRootView style={styles.fill}>
        <SurfaceProvider surface="dark">
          <SheetBody {...props} onGone={() => setMounted(false)} />
        </SurfaceProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function SheetBody({
  visible,
  onClose,
  onGone,
  title,
  closeLabel,
  children,
}: SheetProps & { onGone: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const { height: screenHeight } = useWindowDimensions();
  const height = useSharedValue(screenHeight);
  const y = useSharedValue(screenHeight);
  const start = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      y.value = withSpring(0, springs.sheet);
    } else {
      y.value = withSpring(height.value, springs.sheet, (finished) => {
        if (finished) scheduleOnRN(onGone);
      });
    }
  }, [visible, y, height, onGone]);

  const pan = Gesture.Pan()
    .onStart(() => {
      start.value = y.value;
    })
    .onUpdate((e) => {
      y.set(Math.max(0, start.get() + e.translationY));
    })
    .onEnd((e) => {
      if (
        e.translationY > height.value * motion.sheetDismissShare ||
        e.velocityY > motion.flingVelocity
      ) {
        scheduleOnRN(onClose);
      } else {
        y.set(withSpring(0, springs.sheet));
      }
    });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, height.value], [1, 0], 'clamp'),
  }));

  return (
    <>
      <Animated.View style={[styles.overlay, backdrop]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
        />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <Animated.View
            aria-modal
            onLayout={(e) => {
              height.set(e.nativeEvent.layout.height);
            }}
            style={[styles.panel, { paddingBottom: spacing.xl + insets.bottom }, panel]}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                onPress={() => {
                  haptic.light();
                  onClose();
                }}
                haptics={false}
                scale={motion.pressScaleRound}
                style={styles.close}
              >
                <Icon name="close" color={colors.textSecondary} />
              </PressableScale>
            </View>
            <View style={styles.body}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: c.overlay },
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
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
    },
    handle: {
      alignSelf: 'center',
      width: layout.sheetHandleWidth,
      height: layout.sheetHandleHeight,
      borderRadius: radius.pill,
      backgroundColor: c.hairlineStrong,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    title: { flex: 1, color: c.textPrimary, ...nativeTextStyle('h2') },
    close: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { gap: spacing.md },
  });

const styles = StyleSheet.create({ fill: { flex: 1 } });
