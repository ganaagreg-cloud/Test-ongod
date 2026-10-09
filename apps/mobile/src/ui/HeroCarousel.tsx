import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  aspect,
  layout,
  motion,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type CoverFamily,
} from '@ongod/tokens';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { goldGlowShadow } from './Glass';
import { springs, useAmbientActive } from './motion';
import { SurfaceProvider } from './surface';
import { PressableScale } from './usePressScale';

export interface HeroItem {
  id: string;
  title: string;
  /** "Шинэ цуврал" */
  tag?: string | undefined;
  /** "№ 001 · 41 мин" */
  meta: string;
  /** The episode's 16:9 picture. */
  imageUri?: string | null | undefined;
  family?: CoverFamily;
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<HeroItem>);

/**
 * Paged hero banner for the latest episodes. The active slide's picture eases from 1.14 to 1
 * (Ken Burns), the dots stretch with the scroll, and it advances every 4.8 s unless a finger is
 * on it. Always dark.
 */
export function HeroCarousel({
  items,
  onOpen,
  onPlay,
  playLabel,
  slideLabel,
}: {
  items: readonly HeroItem[];
  onOpen: (item: HeroItem) => void;
  onPlay: (item: HeroItem) => void;
  playLabel: string;
  /** Accessible name of dot n (1-based), e.g. "2-р слайд". */
  slideLabel: (n: number) => string;
}) {
  const { width: screen } = useWindowDimensions();
  const slideWidth = Math.min(screen, layout.overlayMaxWidth * 2) - 2 * layout.screenPadding;
  const step = slideWidth + spacing.sm;
  const list = useRef<FlatList<HeroItem>>(null);
  const [index, setIndex] = useState(0);
  const [touching, setTouching] = useState(false);
  const active = useAmbientActive();
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const goTo = useCallback(
    (i: number) => {
      list.current?.scrollToOffset({ offset: i * step, animated: true });
      setIndex(i);
    },
    [step],
  );

  // Auto-advance; the timer restarts after every change and while touched it does not run.
  useEffect(() => {
    if (!active || touching || items.length < 2) return;
    const timer = setTimeout(() => goTo((index + 1) % items.length), motion.carouselAutoMs);
    return () => clearTimeout(timer);
  }, [active, touching, index, items.length, goTo]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / step));
  };

  return (
    <SurfaceProvider surface="dark">
      <View>
        <AnimatedFlatList
          ref={list}
          data={items as HeroItem[]}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          disableIntervalMomentum
          onScroll={onScroll}
          scrollEventThrottle={16}
          onTouchStart={() => setTouching(true)}
          onTouchEnd={() => setTouching(false)}
          onTouchCancel={() => setTouching(false)}
          onMomentumScrollEnd={settle}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.track}
          ItemSeparatorComponent={Gap}
          renderItem={({ item, index: i }) => (
            <Slide
              item={item}
              width={slideWidth}
              active={i === index}
              onOpen={() => onOpen(item)}
              onPlay={() => onPlay(item)}
              playLabel={playLabel}
            />
          )}
        />
        <View style={styles.dots}>
          {items.map((item, i) => (
            <Dot
              key={item.id}
              index={i}
              step={step}
              scrollX={scrollX}
              label={slideLabel(i + 1)}
              onPress={() => goTo(i)}
            />
          ))}
        </View>
      </View>
    </SurfaceProvider>
  );
}

const Gap = () => <View style={styles.gap} />;

function Dot({
  index,
  step,
  scrollX,
  label,
  onPress,
}: {
  index: number;
  step: number;
  scrollX: { value: number };
  label: string;
  onPress: () => void;
}) {
  const dark = themes.dark;
  const style = useAnimatedStyle(() => {
    const range = [(index - 1) * step, index * step, (index + 1) * step];
    return {
      width: interpolate(
        scrollX.value,
        range,
        [layout.dotSize, layout.dotActiveWidth, layout.dotSize],
        'clamp',
      ),
      backgroundColor: interpolateColor(scrollX.value, range, [
        withAlpha(dark.textPrimary, 0.25),
        dark.accent,
        withAlpha(dark.textPrimary, 0.25),
      ]),
    };
  });
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.dotHit}
    >
      <Animated.View style={[styles.dot, style]} />
    </PressableScale>
  );
}

function Slide({
  item,
  width,
  active,
  onOpen,
  onPlay,
  playLabel,
}: {
  item: HeroItem;
  width: number;
  active: boolean;
  onOpen: () => void;
  onPlay: () => void;
  playLabel: string;
}) {
  const dark = themes.dark;
  const zoom = useSharedValue<number>(motion.kenBurnsFrom);
  const reveal = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    if (active) {
      zoom.value = motion.kenBurnsFrom;
      zoom.value = withTiming(1, {
        duration: motion.kenBurnsMs,
        easing: Easing.bezier(0.2, 0.6, 0.2, 1),
        reduceMotion: ReduceMotion.System,
      });
    } else {
      zoom.value = motion.kenBurnsFrom;
    }
    reveal.value = withSpring(active ? 1 : 0, springs.smooth);
  }, [active, zoom, reveal]);

  const imageStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * spacing.sm }],
  }));

  return (
    <View style={[styles.slide, { width, backgroundColor: dark.brand }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.meta}`}
        onPress={onOpen}
        scale={motion.pressScale}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
          <Artwork uri={item.imageUri} size="large" {...(item.family && { family: item.family })} />
        </Animated.View>
        <LinearGradient
          colors={[withAlpha(dark.bg, 0), withAlpha(dark.bg, 0.55), withAlpha(dark.bg, 0.95)]}
          locations={[0.25, 0.55, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </PressableScale>
      <Animated.View style={[styles.content, textStyle]} pointerEvents="box-none">
        <View style={styles.copy} pointerEvents="none">
          {item.tag ? (
            <View style={[styles.tag, { backgroundColor: withAlpha(dark.accent, 0.18) }]}>
              <Text style={[styles.tagText, { color: dark.accent }]}>{item.tag}</Text>
            </View>
          ) : null}
          <Text style={[styles.title, { color: dark.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.meta, { color: dark.textSecondary }]}>{item.meta}</Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playLabel}
          onPress={onPlay}
          scale={motion.pressScaleRound}
          style={[styles.play, { backgroundColor: dark.accent }, goldGlowShadow]}
        >
          <Icon name="play" color={dark.onAccent} />
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { paddingHorizontal: layout.screenPadding },
  gap: { width: spacing.sm },
  slide: {
    aspectRatio: aspect.artwork,
    borderRadius: radius.hero,
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  copy: { flex: 1, gap: spacing.xxs },
  tag: {
    alignSelf: 'flex-start',
    height: layout.badgeHeight,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  tagText: { ...nativeTextStyle('caption'), fontFamily: nativeFontFamily.ui[600] },
  title: { ...nativeTextStyle('h1'), fontFamily: nativeFontFamily.display[600] },
  meta: { ...nativeTextStyle('small') },
  play: {
    width: layout.playButton,
    height: layout.playButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxs },
  dotHit: {
    height: layout.touchTarget,
    paddingHorizontal: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { height: layout.dotSize, borderRadius: radius.pill },
});
