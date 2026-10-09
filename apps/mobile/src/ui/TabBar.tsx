import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import {
  glass,
  layout,
  motion,
  nativeTextStyle,
  radius,
  themes,
  withAlpha,
  type IconName,
} from '@ongod/tokens';
import { Glass, floatingShadow } from './Glass';
import { Icon } from './Icon';
import { springs } from './motion';
import { SurfaceProvider, useSurface } from './surface';
import { PressableScale } from './usePressScale';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

/**
 * The floating glass pill with the four tabs. Always dark green, on every screen (ADR-0028). The
 * active tab is a forest pill with a gold hairline that slides between tabs (spring.smooth); its
 * icon bounces 1 -> 1.12 -> 1. Place it absolutely above the safe area (see `layout.tabBar*`).
 */
export function TabBar({
  items,
  activeKey,
  onSelect,
}: {
  items: readonly TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const dark = themes.dark;
  // Over a cream screen the bar is brand green with a paper pill (Library.dc.html).
  const onCream = useSurface().surface === 'cream';
  const look = onCream
    ? {
        base: themes.cream.brand,
        opacity: glass.tabBarOnCream,
        pill: themes.cream.bg,
        pillBorder: 'transparent',
        active: themes.cream.textPrimary,
        inactive: dark.textSecondary,
      }
    : {
        base: dark.surfaceRaised,
        opacity: glass.tabBar,
        pill: dark.heritage,
        pillBorder: withAlpha(dark.accent, 0.22),
        active: dark.textPrimary,
        inactive: dark.textSecondary,
      };
  const [width, setWidth] = useState(0);
  const slot = items.length > 0 ? (width - 2 * layout.tabBarPadding) / items.length : 0;
  const index = Math.max(
    0,
    items.findIndex((i) => i.key === activeKey),
  );
  const x = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (slot <= 0) return;
    const target = index * slot;
    if (!placed.current) {
      x.value = target;
      placed.current = true;
    } else {
      x.value = withSpring(target, springs.smooth);
    }
  }, [index, slot, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <SurfaceProvider surface="dark">
      <Glass
        tone="dark"
        base={look.base}
        opacity={look.opacity}
        style={[styles.bar, { borderColor: dark.hairline }, floatingShadow]}
      >
        <View
          accessibilityRole="tablist"
          style={styles.inner}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width + 2 * layout.tabBarPadding)}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: slot,
                backgroundColor: look.pill,
                borderColor: look.pillBorder,
              },
              pill,
            ]}
          />
          {items.map((item) => (
            <Tab
              key={item.key}
              item={item}
              activeColor={look.active}
              inactiveColor={look.inactive}
              selected={item.key === activeKey}
              onPress={() => onSelect(item.key)}
            />
          ))}
        </View>
      </Glass>
    </SurfaceProvider>
  );
}

function Tab({
  item,
  selected,
  activeColor,
  inactiveColor,
  onPress,
}: {
  item: TabItem;
  selected: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
}) {
  const bounce = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected) {
      bounce.value = withSequence(
        withSpring(motion.iconBounce, springs.snappy),
        withSpring(1, springs.snappy),
      );
    }
  }, [selected, bounce]);
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
  const color = selected ? activeColor : inactiveColor;
  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View style={icon}>
        <Icon name={item.icon} size="tab" color={color} />
      </Animated.View>
      <Text style={[styles.label, { color }]}>{item.label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: layout.tabBarHeight,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    padding: layout.tabBarPadding,
  },
  inner: { flex: 1, flexDirection: 'row' },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: layout.eqGap },
  label: { ...nativeTextStyle('caption') },
});
