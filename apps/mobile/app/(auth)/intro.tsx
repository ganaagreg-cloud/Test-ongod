import { useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  layout,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type IconName,
} from '@ongod/tokens';
import { mn } from '../../src/i18n/mn';
import { markIntroSeen } from '../../src/lib/intro';
import { AuroraBackground, Button, Icon, SurfaceProvider, TextLink } from '../../src/ui';

const dark = themes.dark;
const ICONS: IconName[] = ['audio', 'bookmark', 'bell'];

/** Three pages about the app, shown once before Welcome (ADR-0088). Skip is on every page. */
export default function Intro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList>(null);
  const [page, setPage] = useState(0);
  const last = page === mn.intro.pages.length - 1;

  const finish = async () => {
    await markIntroSeen().catch(() => undefined); // worst case: the pages show once more
    router.replace('/welcome');
  };

  const next = () => {
    if (last) void finish();
    else list.current?.scrollToIndex({ index: page + 1 });
  };

  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="welcome" />
        <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
          {last ? null : <TextLink label={mn.intro.skip} onPress={() => void finish()} />}
        </View>
        <FlatList
          ref={list}
          data={mn.intro.pages}
          keyExtractor={(item) => item.title}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item, index }) => (
            <View style={[styles.page, { width }]}>
              <View style={styles.tile}>
                <Icon name={ICONS[index] ?? 'audio'} color={dark.accent} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {item.title}
              </Text>
              <Text style={styles.text}>{item.text}</Text>
            </View>
          )}
        />
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.dots} accessibilityElementsHidden>
            {mn.intro.pages.map((p, i) => (
              <View key={p.title} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
          <Button label={last ? mn.intro.start : mn.intro.next} sheen fullWidth onPress={next} />
        </View>
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dark.bg },
  top: {
    alignItems: 'flex-end',
    minHeight: layout.touchTarget + spacing.xl,
    paddingHorizontal: layout.screenPadding,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding + spacing.xxs,
  },
  tile: {
    width: layout.iconTile + spacing.xl,
    height: layout.iconTile + spacing.xl,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: withAlpha(dark.accent, 0.3),
    backgroundColor: dark.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { color: dark.textPrimary, textAlign: 'center', ...nativeTextStyle('display') },
  text: {
    maxWidth: layout.welcomeTextMax,
    color: dark.textSecondary,
    textAlign: 'center',
    ...nativeTextStyle('body'),
  },
  bottom: {
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding + spacing.xxs,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: {
    width: layout.dotSize,
    height: layout.dotSize,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(dark.textPrimary, 0.25),
  },
  dotActive: { width: layout.dotActiveWidth, backgroundColor: dark.accent },
});
