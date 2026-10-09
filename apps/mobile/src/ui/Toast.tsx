import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { floatingShadow } from './Glass';
import { Icon } from './Icon';
import { springs } from './motion';
import { useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export type ToastTone = 'info' | 'success' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs <ToastProvider>');
  return api;
}

const ICON = { info: 'info', success: 'check', danger: 'alert' } as const;
/** Pulls a toast this far (as a share of its height) above the screen when it is dismissed. */
const OFFSCREEN = 2;

function ToastView({
  item,
  older,
  closeLabel,
  durationMs,
  onDismiss,
}: {
  item: ToastItem;
  /** Not the newest: shown smaller and dimmer. */
  older: boolean;
  closeLabel: string;
  durationMs: number;
  onDismiss: (id: number) => void;
}) {
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const tone = { info: colors.info, success: colors.success, danger: colors.danger }[item.tone];
  const height = useSharedValue<number>(layout.touchTarget);
  const y = useSharedValue(-layout.overlayMaxWidth);
  const start = useSharedValue(0);

  const dismiss = useCallback(() => {
    y.value = withSpring(-height.value * OFFSCREEN - layout.headerHeight, springs.snappy, (done) => {
      if (done) scheduleOnRN(onDismiss, item.id);
    });
  }, [y, height, onDismiss, item.id]);

  useEffect(() => {
    // Drops in from the top, then leaves by itself.
    y.value = withSpring(0, springs.snappy);
    // Screen readers hear it once, when it appears.
    AccessibilityInfo.announceForAccessibility(item.message);
    const timer = setTimeout(dismiss, durationMs);
    return () => clearTimeout(timer);
  }, [y, durationMs, item.message, dismiss]);

  const swipe = Gesture.Pan()
    .activeOffsetY([-spacing.xxs, spacing.xxs])
    .onStart(() => {
      start.value = y.value;
    })
    .onUpdate((e) => {
      y.value = Math.min(0, start.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY < -spacing.md || e.velocityY < -motion.flingVelocity / 2) {
        scheduleOnRN(dismiss);
      } else {
        y.value = withSpring(0, springs.snappy);
      }
    });

  // 0 = newest, 1 = older (scale .96, opacity 70%).
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withSpring(older ? 1 : 0, springs.smooth);
  }, [older, dim]);

  const animated = useAnimatedStyle(() => ({
    opacity: 1 - dim.value * (1 - motion.toastOlderOpacity),
    transform: [
      { translateY: y.value },
      { scale: 1 - dim.value * (1 - motion.toastOlderScale) },
    ],
  }));

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
        style={[styles.toast, animated]}
        accessibilityRole={item.tone === 'danger' ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
      >
        <Icon name={ICON[item.tone]} color={tone} />
        <Text style={styles.message}>{item.message}</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={dismiss}
          scale={motion.pressScaleRound}
          style={styles.close}
        >
          <Icon name="close" color={colors.textSecondary} />
        </PressableScale>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Wrap the app once (inside the safe-area provider and GestureHandlerRootView); call
 * `useToast().show("...")` anywhere below. Toasts drop from the top; swipe up to dismiss.
 */
export function ToastProvider({
  children,
  closeLabel,
  durationMs = motion.toastMs,
}: {
  children: ReactNode;
  closeLabel: string;
  durationMs?: number;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback<ToastApi['show']>((message, options) => {
    const id = nextId.current++;
    // At most `toastMax` at once: the oldest makes room for the new one.
    setItems((all) => [
      ...all.slice(-(motion.toastMax - 1)),
      { id, message, tone: options?.tone ?? 'info' },
    ]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={[hostStyles.host, { top: layout.screenPadding + insets.top }]}
      >
        {/* Newest on top; the one below it is the older one. */}
        {[...items].reverse().map((item, index) => (
          <ToastView
            key={item.id}
            item={item}
            older={index > 0}
            closeLabel={closeLabel}
            durationMs={durationMs}
            onDismiss={dismiss}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const hostStyles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    alignItems: 'center',
    gap: spacing.xs,
  },
});

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      width: '100%',
      maxWidth: layout.overlayMaxWidth,
      paddingVertical: spacing.xs,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
      ...floatingShadow,
    },
    message: { flex: 1, color: c.textPrimary, ...nativeTextStyle('small') },
    close: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
