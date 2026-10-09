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
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, motion, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { Icon } from './Icon';
import { useReduceMotion } from './useReduceMotion';

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
const TONE_COLOR = { info: colors.info, success: colors.success, danger: colors.danger } as const;

function ToastView({
  item,
  closeLabel,
  durationMs,
  onDismiss,
}: {
  item: ToastItem;
  closeLabel: string;
  durationMs: number;
  onDismiss: (id: number) => void;
}) {
  const reduceMotion = useReduceMotion();
  const [appear] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: reduceMotion ? 0 : motion.durationMs,
      useNativeDriver: true,
    }).start();
    // Screen readers hear it once, when it appears.
    AccessibilityInfo.announceForAccessibility(item.message);
    const timer = setTimeout(() => onDismiss(item.id), durationMs);
    return () => clearTimeout(timer);
  }, [appear, durationMs, item.id, item.message, onDismiss, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] }),
            },
          ],
        },
      ]}
      accessibilityRole={item.tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={ICON[item.tone]} color={TONE_COLOR[item.tone]} />
      <Text style={styles.message}>{item.message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={() => onDismiss(item.id)}
        style={styles.close}
      >
        <Icon name="close" color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

/** Wrap the app once (inside the safe-area provider); call `useToast().show("...")` anywhere below. */
export function ToastProvider({
  children,
  closeLabel,
  durationMs = 4000,
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
    setItems((all) => [...all.slice(-2), { id, message, tone: options?.tone ?? 'info' }]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={[styles.host, { bottom: layout.screenPadding + insets.bottom }]}
      >
        {items.map((item) => (
          <ToastView
            key={item.id}
            item={item}
            closeLabel={closeLabel}
            durationMs={durationMs}
            onDismiss={dismiss}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    alignItems: 'center',
    gap: spacing.xs,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    maxWidth: layout.overlayMaxWidth,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.card,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRaised,
  },
  message: { flex: 1, color: colors.textPrimary, ...nativeTextStyle('small') },
  close: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
