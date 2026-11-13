// The bottom dock of the four tabs: the mini player (while an episode is loaded) docked 8 pt above
// the floating tab bar (DESIGN "TabBar", "MiniPlayer"). Both float over the screens.
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { layout, spacing, withAlpha } from '@ongod/tokens';
import { player, usePlayerState } from '../audio/player';
import { mn } from '../i18n/mn';
import { useNowPlaying } from '../playback/nowPlaying';
import {
  coverFamilyFor,
  MiniPlayer,
  SurfaceProvider,
  TabBar,
  useSurface,
  type TabItem,
} from '../ui';

export const TABS: readonly TabItem[] = [
  { key: 'home', label: mn.tabs.home, icon: 'home' },
  { key: 'library', label: mn.tabs.library, icon: 'library' },
  { key: 'saved', label: mn.tabs.saved, icon: 'bookmark' },
  { key: 'profile', label: mn.tabs.profile, icon: 'profile' },
];

export function AppTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nowPlaying = useNowPlaying();
  const playback = usePlayerState();
  const active = state.routes[state.index]?.name ?? 'home';

  const select = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && route.name !== active) navigateToTab(route.key);
  };

  const openPlayer = () => {
    if (nowPlaying) router.push({ pathname: '/player/[id]', params: { id: nowPlaying.id } });
  };

  return (
    // The tab bar reads the surface: brand green with a paper pill over the cream Сан screen.
    <SurfaceProvider surface={active === 'library' ? 'cream' : 'dark'}>
      <DockBackdrop bottomSpace={insets.bottom + layout.tabBarGap} />
      <View
        pointerEvents="box-none"
        style={[styles.dock, { bottom: insets.bottom + layout.tabBarGap }]}
      >
        {nowPlaying ? (
          <MiniPlayer
            title={nowPlaying.title}
            subtitle={nowPlaying.category.name}
            coverUri={nowPlaying.thumbUrl ?? nowPlaying.coverUrl}
            family={coverFamilyFor(nowPlaying.id)}
            playing={playback.status === 'playing'}
            progress={playback.durationSec > 0 ? playback.positionSec / playback.durationSec : 0}
            onOpen={openPlayer}
            // A refused renewal (access ended) is explained on the Player screen.
            onTogglePlay={() => void player.toggle().catch(openPlayer)}
            playLabel={mn.episode.play}
            pauseLabel={mn.episode.pause}
          />
        ) : null}
        <TabBar items={TABS} activeKey={active} onSelect={select} />
      </View>
    </SurfaceProvider>
  );
}

/**
 * The strip under and around the floating bar (ADR-0102): the page colour, fading in above the
 * bar, so lists do not show through the gap beneath it and the bar sits on a plain footer.
 */
function DockBackdrop({ bottomSpace }: { bottomSpace: number }) {
  const { colors } = useSurface();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[withAlpha(colors.bg, 0), colors.bg, colors.bg]}
      locations={[0, 0.35, 1]}
      style={[styles.backdrop, { height: bottomSpace + layout.tabBarHeight + spacing.xl }]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dock: {
    position: 'absolute',
    left: layout.tabBarInset,
    right: layout.tabBarInset,
    gap: layout.miniPlayerGap,
  },
});
