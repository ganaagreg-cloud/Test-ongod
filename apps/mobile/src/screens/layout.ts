import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@ongod/tokens';
import { useNowPlaying } from '../playback/nowPlaying';

/**
 * Bottom padding for a tab screen: the floating tab bar (and the mini player while an episode is
 * loaded) sit over the content, so the last row must scroll clear of them.
 */
export function useBottomSpace(): number {
  const insets = useSafeAreaInsets();
  const mini = useNowPlaying() !== null;
  return (
    insets.bottom +
    layout.tabBarGap +
    layout.tabBarHeight +
    (mini ? layout.miniPlayerGap + layout.miniPlayerHeight : 0) +
    spacing.xl
  );
}
