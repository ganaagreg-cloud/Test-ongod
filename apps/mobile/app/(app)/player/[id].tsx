import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { EpisodeItem } from '@ongod/shared';
import { colors, layout, motion, nativeTextStyle, spacing } from '@ongod/tokens';
import { player, usePlayerState } from '../../../src/audio/player';
import { useAuth } from '../../../src/auth/AuthContext';
import { useAppConfig } from '../../../src/config/useAppConfig';
import { useEpisode, useToggleSaved } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { clockLabel, episodeMeta, isLocked, resumeAt } from '../../../src/lib/episode';
import { failureOf, startEpisode, type StartFailure } from '../../../src/playback/nowPlaying';
import { nextInQueue, nextRows } from '../../../src/playback/queue';
import { NoAccessSheet } from '../../../src/screens/NoAccessSheet';
import { openLibrary } from '../../../src/screens/navigation';
import { CommentsSection } from '../../../src/screens/player/CommentsSection';
import { DescriptionText } from '../../../src/screens/player/DescriptionText';
import { NextList } from '../../../src/screens/player/NextList';
import { MiniBar } from '../../../src/screens/player/MiniBar';
import { PlayerControls } from '../../../src/screens/player/PlayerControls';
import { PlayerPicture } from '../../../src/screens/player/PlayerPicture';
import { SleepSheet } from '../../../src/screens/player/SleepSheet';
import {
  AuroraBackground,
  Button,
  coverFamilyFor,
  EmptyState,
  Enter,
  Icon,
  PressableScale,
  Scrubber,
  Skeleton,
  SurfaceProvider,
  useToast,
} from '../../../src/ui';

/** Seconds the autoplay countdown shows before the next episode starts (ADR-0049). */
const AUTOPLAY_SECONDS = 3;
/** Rows under "Дараагийн" (ADR-0067). */
const NEXT_ROWS = 4;

/**
 * Player (dark, a sheet over the tabs; DESIGN "Player", Player.dc.html). Also the episode page:
 * opened from a list it shows the episode ready to play; `autoplay=1` (play buttons, "Үргэлжлүүлэх")
 * starts it at once from the saved position.
 */
export default function PlayerScreen() {
  const { id, autoplay } = useLocalSearchParams<{ id: string; autoplay?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { supportEmail } = useAppConfig();
  const episode = useEpisode(id);
  const state = usePlayerState();
  const toggleSaved = useToggleSaved();
  const [noAccessOpen, setNoAccess] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  /** The refusal the member already closed the sheet for. */
  const [dismissed, setDismissed] = useState<typeof state.error>(null);
  const autoStarted = useRef(false);
  /** Scroll offset at which the big controls are half out of view, and whether we are past it. */
  const controlsGone = useRef(Infinity);
  const [compact, setCompact] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y >= controlsGone.current;
    setCompact((was) => (was === past ? was : past));
  };
  /** The member pressed "Болих" on the countdown of the episode that just ended. */
  const [autoplayCancelled, setAutoplayCancelled] = useState(false);

  const loaded = state.episodeId === id;
  const playing = loaded && state.status === 'playing';
  /** Loading or buffering: the picture keeps its "playing" look instead of flashing the button. */
  const busy = loaded && (state.status === 'loading' || state.buffering);
  // A renewal refused while listening (access ended) opens the same sheet.
  const refused = loaded && state.error?.code === 'NO_ACCESS' && state.error !== dismissed;
  const noAccess = noAccessOpen || refused;
  const item = episode.data;
  const lockedOf = (target: EpisodeItem) => isLocked(target, user?.accessUntil, new Date());
  // "Дараагийн": the item after this one in the list the Player was opened from; without that list
  // (push, mini player) the API's order: the next series part, then the next of the category.
  const queued = item ? nextInQueue(item.id) : undefined;
  const upNext = item
    ? queued !== undefined
      ? queued
      : (item.nextInSeries ?? item.next[0] ?? null)
    : null;
  // The rows under "Дараагийн" (ADR-0067): the next item first, then the API's next of the category.
  const upNextRows = nextRows(upNext, item?.id ?? '', item?.next ?? [], NEXT_ROWS);
  // Autoplay (ADR-0049): an episode that ended, no sleep timer, an item the member can play.
  // Starting it still goes through the play endpoint, which decides access.
  const autoplayNext =
    loaded &&
    state.status === 'ended' &&
    !state.autoplayBlocked &&
    !autoplayCancelled &&
    upNext &&
    !lockedOf(upNext)
      ? upNext
      : null;
  // The countdown sits under the big controls: bring them back into view when it starts.
  const countdownShown = autoplayNext !== null;
  useEffect(() => {
    if (countdownShown) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [countdownShown]);
  const playNext = useCallback(
    (next: EpisodeItem) =>
      router.replace({ pathname: '/player/[id]', params: { id: next.id, autoplay: '1' } }),
    [router],
  );

  const explain = useCallback(
    (failure: StartFailure) => {
      if (failure.reason === 'noAccess') {
        setNoAccess(true);
        return;
      }
      const text =
        failure.reason === 'notReady'
          ? mn.player.notReady
          : failure.reason === 'videoUnsupported'
            ? mn.player.videoUnsupported
            : (failure.message ?? mn.player.playError);
      toast.show(text, { tone: 'danger' });
    },
    [toast],
  );

  /** Play, seek and skip can fail too (a refused URL renewal): the same explanation. */
  const onPlaybackError = useCallback((error: unknown) => explain(failureOf(error)), [explain]);

  const start = useCallback(
    async (target: EpisodeItem) => {
      const failure = await startEpisode(target);
      if (failure) explain(failure);
    },
    [explain],
  );

  // Play buttons open the Player with autoplay: start once, unless it is already the loaded one.
  // Started from a timer, not in the effect body, because starting updates the screen's state.
  useEffect(() => {
    if (autoplay !== '1' || !item || autoStarted.current) return;
    const target = item;
    const alreadyLoaded = state.episodeId === target.id;
    const paused = state.status !== 'playing';
    const timer = setTimeout(() => {
      autoStarted.current = true;
      if (!alreadyLoaded) void start(target);
      else if (paused) void player.play().catch(onPlaybackError);
    }, 0);
    return () => clearTimeout(timer);
  }, [autoplay, item, start, onPlaybackError, state.episodeId, state.status]);

  const toggle = () => {
    if (!item) return;
    setAutoplayCancelled(false);
    if (!loaded) {
      void start(item);
      return;
    }
    player.toggle().catch(onPlaybackError);
  };

  if (!item) {
    return (
      <SurfaceProvider surface="dark">
        <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
          <TopBar onClose={() => router.back()} />
          {episode.isError ? (
            <EmptyState
              title={mn.episode.loadError}
              action={
                <Button
                  label={mn.common.retry}
                  variant="secondary"
                  onPress={() => void episode.refetch()}
                />
              }
            />
          ) : (
            <View style={styles.padded} aria-hidden>
              <Skeleton shape="block" height={layout.cardWidth} />
              <Skeleton width="70%" />
              <Skeleton width="40%" />
            </View>
          )}
        </View>
      </SurfaceProvider>
    );
  }

  const durationSec = loaded && state.durationSec > 0 ? state.durationSec : (item.durationSec ?? 0);
  const positionSec = loaded ? state.positionSec : resumeAt(item);

  return (
    <SurfaceProvider surface="dark">
      <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
        <AuroraBackground variant="player" />
        <TopBar
          onClose={() => router.back()}
          saved={item.saved}
          onToggleSave={() => {
            toggleSaved.mutate({ id: item.id, saved: !item.saved });
            toast.show(item.saved ? mn.episode.unsaved : mn.episode.saved, { tone: 'success' });
          }}
        />
        {/* The whole page scrolls; the slim bar over it takes over from the controls (ADR-0067). */}
        <View style={styles.body}>
          <ScrollView
            ref={scrollRef}
            style={styles.descriptionArea}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
            scrollEventThrottle={32}
            onScroll={onScroll}
            // Typing a comment: the field stays above the keyboard, and a tap on "Илгээх" works
            // with the keyboard open.
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.fixed}>
              <Enter index={0}>
                <PlayerPicture
                  uri={item.coverUrl}
                  title={item.title}
                  family={coverFamilyFor(item.id)}
                  playing={playing || busy}
                  video={loaded && state.kind === 'VIDEO'}
                  locked={lockedOf(item)}
                  onPlay={toggle}
                />
              </Enter>

              <Enter index={1} style={styles.block}>
                <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
                  {item.title}
                </Text>
                <Text style={styles.meta}>{episodeMeta(item, true)}</Text>
              </Enter>

              <Enter index={2} style={styles.block}>
                <Scrubber
                  positionSec={positionSec}
                  durationSec={durationSec}
                  disabled={!loaded}
                  onSeek={(sec) => {
                    setAutoplayCancelled(false);
                    void player.seekTo(sec).catch(onPlaybackError);
                  }}
                  label={mn.player.position}
                  valueText={clockLabel(positionSec)}
                />
                <View style={styles.times}>
                  <Text style={styles.time}>{clockLabel(positionSec)}</Text>
                  <Text style={styles.time}>
                    -{clockLabel(Math.max(0, durationSec - positionSec))}
                  </Text>
                </View>
              </Enter>

              <View
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  controlsGone.current = y + height / 2;
                }}
              >
                <Enter index={3}>
                  <PlayerControls
                    playing={playing}
                    rate={state.rate}
                    sleepOn={loaded && state.sleep.mode !== null}
                    canSeek={loaded}
                    onToggle={toggle}
                    onBack={() => void player.skipBack().catch(onPlaybackError)}
                    onForward={() => void player.skipForward().catch(onPlaybackError)}
                    onRate={() => player.cycleRate()}
                    onSleep={() => setSleepOpen(true)}
                  />
                </Enter>
              </View>

              {autoplayNext ? (
                <AutoplayCountdown
                  next={autoplayNext}
                  onDone={playNext}
                  onCancel={() => setAutoplayCancelled(true)}
                />
              ) : null}
            </View>

            <View style={styles.description}>
              {item.description.trim() ? <DescriptionText text={item.description} /> : null}
              <CommentsSection episodeId={item.id} supportEmail={supportEmail} />
              {upNext ? (
                <NextList
                  items={upNextRows}
                  ofSeries={upNext.id === item.nextInSeries?.id}
                  lockedOf={lockedOf}
                  onOpen={playNext}
                  onAll={() => {
                    router.back();
                    openLibrary(router, item.category.slug);
                  }}
                />
              ) : null}
            </View>
          </ScrollView>
          {compact ? (
            <View style={styles.miniBar}>
              <MiniBar
                title={item.title}
                playing={playing}
                fraction={durationSec > 0 ? positionSec / durationSec : 0}
                onToggle={toggle}
              />
            </View>
          ) : null}
        </View>

        <SleepSheet
          visible={sleepOpen}
          value={state.sleep.mode}
          onClose={() => setSleepOpen(false)}
          onPick={(mode) => {
            if (mode === null) player.cancelSleep();
            else {
              player.startSleep(mode);
              toast.show(mn.player.sleepSet);
            }
            setSleepOpen(false);
          }}
        />
        <NoAccessSheet
          visible={noAccess}
          onClose={() => {
            setNoAccess(false);
            setDismissed(state.error);
          }}
          onPlay={() => {
            setNoAccess(false);
            void start(item);
          }}
        />
      </View>
    </SurfaceProvider>
  );
}

/** 3, 2, 1, then `onDone`; "Болих" stops it (ADR-0049). Mounted only while the countdown runs. */
function AutoplayCountdown({
  next,
  onDone,
  onCancel,
}: {
  next: EpisodeItem;
  onDone: (next: EpisodeItem) => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(AUTOPLAY_SECONDS);
  useEffect(() => {
    if (left === 0) {
      onDone(next);
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, next, onDone]);
  return (
    <View style={styles.countdown}>
      <View style={styles.countdownText}>
        <Text style={styles.countdownTitle} accessibilityLiveRegion="polite">
          {mn.player.autoplayIn(left)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {next.title}
        </Text>
      </View>
      <Button label={mn.player.autoplayCancel} variant="secondary" onPress={onCancel} />
    </View>
  );
}

/** Close (chevron down) and the bookmark; no label (ADR-0049). */
function TopBar({
  onClose,
  saved,
  onToggleSave,
}: {
  onClose: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.player.close}
        onPress={onClose}
        scale={motion.pressScaleRound}
        style={styles.iconButton}
      >
        <Icon name="chevronDown" color={colors.textPrimary} />
      </PressableScale>
      {onToggleSave ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={saved ? mn.episode.unsave : mn.episode.save}
          accessibilityState={{ selected: saved === true }}
          onPress={onToggleSave}
          scale={motion.pressScaleRound}
          style={styles.iconButton}
        >
          <Icon
            name={saved ? 'bookmarkFilled' : 'bookmark'}
            color={saved ? colors.accent : colors.textPrimary}
          />
        </PressableScale>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  // Tight gaps: 6.1" iPhone and 360x640 dp Android must fit everything above the description.
  fixed: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  body: { flex: 1 },
  miniBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  descriptionArea: { flex: 1 },
  description: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.xs, gap: spacing.xl },
  block: { gap: spacing.xxs },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  countdownText: { flex: 1, gap: spacing.xxs },
  countdownTitle: { color: colors.textPrimary, ...nativeTextStyle('body') },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  iconButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    color: colors.textSecondary,
    ...nativeTextStyle('caption'),
    fontVariant: ['tabular-nums'],
  },
  title: { color: colors.textPrimary, ...nativeTextStyle('h1') },
  meta: { color: colors.textSecondary, ...nativeTextStyle('small') },
});
