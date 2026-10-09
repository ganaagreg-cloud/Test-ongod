/**
 * Listening progress -> PUT /v1/progress/:episodeId (ADR-0021: whole seconds, last write wins, the
 * client decides `completed`, a later `completed: false` clears it).
 *
 * Saves go out while playing every `intervalSec`, and at once on pause, seek, end, sleep-timer stop,
 * when another episode starts and when the player closes. Only one request is in flight: the server
 * keeps whichever write arrives last, so two close requests could land out of order. Requests that
 * arrive meanwhile are merged into one that sends the newest position afterwards. A failed save (no
 * network) is dropped and tried again at the next trigger.
 *
 * Always `await flush(...)` before `track()` of another episode.
 */

/** Within this many seconds of the end the episode counts as heard. */
export const COMPLETE_WITHIN_SEC = 10;
export const SAVE_EVERY_SEC = 15;

export interface ProgressBody {
  positionSec: number;
  completed: boolean;
}

export type SaveReason = 'tick' | 'pause' | 'seek' | 'ended' | 'sleep' | 'switch' | 'close';

export function createProgressSaver(
  save: (episodeId: string, body: ProgressBody) => Promise<void>,
  options: { intervalSec?: number } = {},
) {
  const intervalSec = options.intervalSec ?? SAVE_EVERY_SEC;
  let episodeId: string | undefined;
  let durationSec = 0;
  let positionSec = 0;
  /** What the server last accepted for this episode. */
  let saved: ProgressBody | undefined;
  let inFlight: Promise<void> | undefined;
  let wantSend = false;
  let wantEnded = false;

  const current = (ended: boolean): ProgressBody => ({
    positionSec: Math.max(0, Math.floor(positionSec)),
    completed: ended || (durationSec > 0 && durationSec - positionSec <= COMPLETE_WITHIN_SEC),
  });

  const same = (a: ProgressBody | undefined, b: ProgressBody) =>
    a !== undefined && a.positionSec === b.positionSec && a.completed === b.completed;

  function send(ended: boolean): Promise<void> {
    if (!episodeId) return Promise.resolve();
    wantSend = true;
    wantEnded ||= ended;
    if (inFlight) return inFlight;
    const run = async () => {
      while (wantSend && episodeId) {
        wantSend = false;
        const wasEnded = wantEnded;
        wantEnded = false;
        const id = episodeId;
        const body = current(wasEnded);
        if (same(saved, body)) continue;
        try {
          await save(id, body);
          if (id === episodeId) saved = body;
        } catch {
          // Offline or a server hiccup: the next trigger sends the then-current position.
        }
      }
    };
    // `finally` runs in a later tick, so it always clears the promise that was stored just below
    // (an `inFlight = undefined` inside `run` would be overwritten when nothing had to be sent).
    inFlight = run().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return {
    /** A new episode was loaded. `startAtSec` is where it resumes (already saved on the server). */
    track(id: string, duration: number, startAtSec = 0) {
      episodeId = id;
      durationSec = duration;
      positionSec = startAtSec;
      wantSend = false;
      wantEnded = false;
      saved = { positionSec: Math.floor(startAtSec), completed: false };
    },
    setDuration(duration: number) {
      if (duration > 0) durationSec = duration;
    },
    /** Every engine update: remembers the position and saves on the interval while playing. */
    update(position: number, playing: boolean): void {
      positionSec = position;
      if (playing && saved && position - saved.positionSec >= intervalSec) void send(false);
    },
    /** Save now (if anything changed). `ended` marks the episode as heard. */
    flush(reason: SaveReason): Promise<void> {
      return send(reason === 'ended');
    },
    /** Forget the episode (after a final flush). */
    clear() {
      episodeId = undefined;
      saved = undefined;
    },
    currentEpisodeId: () => episodeId,
  };
}

export type ProgressSaver = ReturnType<typeof createProgressSaver>;
