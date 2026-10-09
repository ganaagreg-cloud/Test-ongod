// DEV ONLY: a bare audio test bench for the device gate (docs/runbooks/DEVICE_SMOKE.md). Reached
// through app/dev/audio.tsx, which only loads this file when __DEV__ is true. It is NOT the player
// screen (that is phase 3): it opens a real episode through the signed URL and exposes every
// control of the engine, so lock-screen, background, speed, sleep timer and progress can be tested
// on a phone. Needs a signed-in user with active access and at least one published episode.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, spacing } from '@ongod/tokens';
import type { EpisodeItem } from '@ongod/shared';
import { api } from '../api';
import { AudioWebNotice } from '../audio/AudioWebNotice';
import { SLEEP_MINUTES } from '../audio/sleepTimer';
import { rateLabel } from '../audio/rates';
import { player, usePlayerState } from '../audio/player';
import { Button } from '../ui';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
};

export default function AudioScreen() {
  const state = usePlayerState();
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEpisodes(20)
      .then((page) => setEpisodes(page.items))
      .catch((error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
      );
  }, []);

  // Updates whenever the player reports a change (about twice a second while playing).
  const sleepLeft = state.sleep.endsAt ? Math.ceil(player.sleepRemainingMs() / 1000) : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>/dev/audio</Text>
      <AudioWebNotice />
      {problem ? <Text style={styles.error}>{problem}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.line}>episode: {state.episodeId ?? '-'}</Text>
        <Text style={styles.line}>
          status: {state.status}
          {state.buffering ? ' (buffering)' : ''} · rate {rateLabel(state.rate)}
        </Text>
        <Text style={styles.line}>
          {clock(state.positionSec)} / {clock(state.durationSec)}
        </Text>
        <Text style={styles.line}>
          sleep:{' '}
          {state.sleep.mode === null
            ? 'off'
            : `${state.sleep.mode} ${sleepLeft > 0 ? clock(sleepLeft) : ''}`}
        </Text>
        {state.error ? (
          <Text style={styles.error}>
            {state.error.code ?? 'ERROR'}: {state.error.message}
          </Text>
        ) : null}
      </View>

      <View style={styles.row}>
        <Button label="-15" variant="secondary" onPress={() => void player.skipBack()} />
        <Button
          label={state.status === 'playing' ? 'Pause' : 'Play'}
          onPress={() => void player.toggle()}
        />
        <Button label="+30" variant="secondary" onPress={() => void player.skipForward()} />
      </View>
      <View style={styles.row}>
        <Button
          label={rateLabel(state.rate)}
          variant="secondary"
          onPress={() => player.cycleRate()}
        />
        {SLEEP_MINUTES.map((minutes) => (
          <Button
            key={minutes}
            label={`${minutes}m`}
            variant="secondary"
            onPress={() => player.startSleep(minutes)}
          />
        ))}
        <Button label="end" variant="secondary" onPress={() => player.startSleep('end')} />
        <Button label="no sleep" variant="ghost" onPress={() => player.cancelSleep()} />
      </View>
      <Button label="Close player" variant="destructive" onPress={() => void player.close()} />

      <Text style={styles.subtitle}>
        Episodes (tap = open and play, resumes from saved progress)
      </Text>
      {episodes.map((episode) => (
        <Button
          key={episode.id}
          label={`${episode.title} · ${clock(episode.durationSec ?? 0)}${episode.progress ? ` · saved ${clock(episode.progress.positionSec)}` : ''}`}
          variant="secondary"
          fullWidth
          onPress={() =>
            void player
              .open({
                id: episode.id,
                title: episode.title,
                artist: episode.category.name,
                // Phase 3 passes the center crop of the 16:9 picture; the dev screen uses it as is.
                ...(episode.coverUrl ? { artworkUrl: episode.coverUrl } : {}),
                startAtSec:
                  episode.progress && !episode.progress.completed
                    ? episode.progress.positionSec
                    : 0,
              })
              .catch(() => undefined)
          }
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.huge },
  title: { color: colors.textPrimary, ...nativeTextStyle('display') },
  subtitle: { color: colors.textSecondary, ...nativeTextStyle('small') },
  panel: { gap: spacing.xxs },
  line: { color: colors.textPrimary, ...nativeTextStyle('body') },
  error: { color: colors.danger, ...nativeTextStyle('small') },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
