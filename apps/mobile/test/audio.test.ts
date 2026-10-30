import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEndpoints } from '../src/api/endpoints';
import {
  SKIP_BACK_SEC,
  SKIP_FORWARD_SEC,
  URL_REFRESH_MARGIN_MS,
  VIDEO_UNSUPPORTED,
  createPlayerController,
  type PlayInfo,
} from '../src/audio/controller';
import { COMPLETE_WITHIN_SEC, createProgressSaver, type ProgressBody } from '../src/audio/progress';
import { RATES, nextRate, rateLabel } from '../src/audio/rates';
import { createSleepTimer, type SleepTimerDeps } from '../src/audio/sleepTimer';
import {
  initialEngineState,
  type AudioEngine,
  type AudioTrack,
  type EngineListener,
  type EngineState,
} from '../src/audio/types';

// The rules around the audio engine (ADR-0032), without a phone: speeds, sleep timer, progress
// saving (ADR-0021) and the controller that ties the engine, the signed URL and the API together.
// Video episodes (ADR-0038) use a second engine behind the same controller; see "video:" tests.

// ---- helpers ----

/** A clock and a timer queue the tests drive by hand. */
function fakeClock(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const deps: SleepTimerDeps = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  return {
    deps,
    now: () => now,
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

/** An engine that records calls and lets the test push state changes. */
function fakeEngine() {
  let state: EngineState = { ...initialEngineState };
  const listeners = new Set<EngineListener>();
  const calls: string[] = [];
  const loads: Array<{ track: AudioTrack; startAtSec: number }> = [];
  const push = (patch: Partial<EngineState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const engine: AudioEngine = {
    async load(track, startAtSec = 0) {
      calls.push('load');
      loads.push({ track, startAtSec });
      push({ status: 'ready', positionSec: startAtSec, durationSec: 600 });
    },
    play() {
      calls.push('play');
      push({ status: 'playing' });
    },
    pause() {
      calls.push('pause');
      push({ status: 'paused' });
    },
    async seekTo(positionSec) {
      calls.push(`seek:${positionSec}`);
      push({ positionSec });
    },
    setRate(rate) {
      calls.push(`rate:${rate}`);
      push({ rate });
    },
    unload() {
      calls.push('unload');
      push({ ...initialEngineState });
    },
    getState: () => state,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { engine, push, calls, loads };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---- speeds ----

test('the speed chip cycles 1x, 1.25x, 1.5x, 2x and starts over', () => {
  assert.deepEqual([...RATES], [1, 1.25, 1.5, 2]);
  assert.equal(nextRate(1), 1.25);
  assert.equal(nextRate(1.25), 1.5);
  assert.equal(nextRate(1.5), 2);
  assert.equal(nextRate(2), 1);
  assert.equal(nextRate(0.75), 1, 'an unknown rate starts again at 1x');
  assert.equal(rateLabel(1.25), '1.25x');
});

// ---- sleep timer ----

test('sleep timer: 15, 30 and 45 minutes fire once at the right time', () => {
  for (const minutes of [15, 30, 45] as const) {
    const clock = fakeClock();
    let fired = 0;
    const timer = createSleepTimer(() => fired++, clock.deps);
    timer.start(minutes);
    assert.equal(timer.getState().mode, minutes);
    assert.equal(timer.remainingMs(), minutes * 60_000);
    clock.advance(minutes * 60_000 - 1);
    assert.equal(fired, 0);
    clock.advance(1);
    assert.equal(fired, 1);
    assert.equal(timer.getState().mode, null);
    clock.advance(60 * 60_000);
    assert.equal(fired, 1, 'fires only once');
  }
});

test('sleep timer: a new choice replaces the old one, cancel stops it', () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = createSleepTimer(() => fired++, clock.deps);
  timer.start(15);
  clock.advance(10 * 60_000);
  timer.start(30);
  clock.advance(20 * 60_000);
  assert.equal(fired, 0, 'the 15-minute timer is gone');
  clock.advance(10 * 60_000);
  assert.equal(fired, 1);

  timer.start(15);
  timer.cancel();
  assert.equal(clock.pending(), 0);
  clock.advance(60 * 60_000);
  assert.equal(fired, 1);
  assert.equal(timer.remainingMs(), 0);
});

test('sleep timer: "end of episode" waits for the end and is used up by it', () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = createSleepTimer(() => fired++, clock.deps);
  assert.equal(timer.episodeEnded(), false, 'nothing chosen: nothing consumed');
  timer.start('end');
  clock.advance(10 * 60 * 60_000);
  assert.equal(fired, 0, 'no clock involved');
  assert.equal(timer.episodeEnded(), true);
  assert.equal(fired, 1);
  assert.equal(timer.episodeEnded(), false);
});

// ---- progress saving ----

test('progress: saves every 15 s while playing, not while paused, whole seconds only', async () => {
  const sent: Array<[string, ProgressBody]> = [];
  const saver = createProgressSaver(async (id, body) => void sent.push([id, body]));
  saver.track('ep1', 600, 0);

  saver.update(5.4, true);
  saver.update(14.9, true);
  await saver.flush('tick').then(() => undefined);
  assert.equal(sent.length, 1, 'the flush sends the latest, 14 s');
  assert.deepEqual(sent[0], ['ep1', { positionSec: 14, completed: false }]);

  saver.update(20, true);
  await flush();
  assert.equal(sent.length, 1, 'less than 15 s since the last save');
  saver.update(29.9, true);
  await flush();
  assert.deepEqual(sent[1], ['ep1', { positionSec: 29, completed: false }]);

  saver.update(300, false);
  await flush();
  assert.equal(sent.length, 2, 'paused: no timed save');
  await saver.flush('pause');
  assert.deepEqual(sent[2], ['ep1', { positionSec: 300, completed: false }]);
});

test('progress: nothing is sent twice for the same position', async () => {
  const sent: ProgressBody[] = [];
  const saver = createProgressSaver(async (_id, body) => void sent.push(body));
  saver.track('ep1', 600, 40);
  await saver.flush('pause');
  assert.equal(sent.length, 0, 'still at the resume position');
  saver.update(70, false);
  await saver.flush('pause');
  await saver.flush('pause');
  assert.equal(sent.length, 1);
});

test('progress: the end, or the last seconds, mark the episode as heard', async () => {
  const sent: ProgressBody[] = [];
  const saver = createProgressSaver(async (_id, body) => void sent.push(body));
  saver.track('ep1', 600, 0);
  saver.update(600 - COMPLETE_WITHIN_SEC - 1, false);
  await saver.flush('seek');
  assert.equal(sent.at(-1)?.completed, false);
  saver.update(600 - COMPLETE_WITHIN_SEC, false);
  await saver.flush('seek');
  assert.equal(sent.at(-1)?.completed, true);

  saver.track('ep2', 0, 0);
  saver.update(100, false);
  await saver.flush('ended');
  assert.equal(sent.at(-1)?.completed, true, 'ended wins even when the duration is unknown');
});

test('progress: starting over sends completed false again (ADR-0021 clears the flag)', async () => {
  const sent: ProgressBody[] = [];
  const saver = createProgressSaver(async (_id, body) => void sent.push(body));
  saver.track('ep1', 600, 0);
  saver.update(600, false);
  await saver.flush('ended');
  saver.update(3, false);
  await saver.flush('seek');
  assert.deepEqual(sent.at(-1), { positionSec: 3, completed: false });
});

test('progress: one request at a time, the newest position goes last, a failure is retried', async () => {
  const log: string[] = [];
  const releases: Array<() => void> = [];
  let fail = true;
  const saver = createProgressSaver(async (_id, body) => {
    log.push(`start:${body.positionSec}`);
    await new Promise<void>((resolve) => releases.push(resolve));
    log.push(`end:${body.positionSec}`);
    if (fail) {
      fail = false;
      throw new Error('offline');
    }
  });
  saver.track('ep1', 600, 0);

  saver.update(20, false);
  const first = saver.flush('seek');
  saver.update(40, false);
  void saver.flush('seek');
  saver.update(55, false);
  void saver.flush('pause');
  assert.deepEqual(log, ['start:20'], 'the others wait');

  releases.shift()!();
  await flush();
  assert.deepEqual(log, ['start:20', 'end:20', 'start:55'], 'only the newest follows');
  releases.shift()!();
  await first;
  assert.deepEqual(log, ['start:20', 'end:20', 'start:55', 'end:55']);

  // 20 failed (offline), 55 went through: nothing left to send, nothing threw.
  saver.update(70, false);
  const retry = saver.flush('pause');
  assert.deepEqual(log.at(-1), 'start:70');
  releases.shift()!();
  await retry;
});

test('progress: a save asked for right after the previous one finished is not lost', async () => {
  // Every moment between the request finishing and the saver tidying up afterwards.
  for (let ticks = 0; ticks < 6; ticks++) {
    const sent: ProgressBody[] = [];
    const saver = createProgressSaver(async (_id, body) => void sent.push(body));
    saver.track('ep1', 600, 0);
    saver.update(130, false);
    void saver.flush('seek');
    for (let i = 0; i < ticks; i++) await Promise.resolve();
    saver.update(400, false);
    void saver.flush('sleep');
    await flush();
    assert.deepEqual(
      sent.map((body) => body.positionSec),
      [130, 400],
      `after ${ticks} microtasks`,
    );
  }
});

test('progress: a flush for another episode is finished before the new one starts', async () => {
  const sent: Array<[string, number]> = [];
  const saver = createProgressSaver(async (id, body) => void sent.push([id, body.positionSec]));
  saver.track('ep1', 600, 0);
  saver.update(90, false);
  await saver.flush('switch');
  saver.track('ep2', 300, 0);
  saver.update(10, false);
  await saver.flush('pause');
  assert.deepEqual(sent, [
    ['ep1', 90],
    ['ep2', 10],
  ]);
});

// ---- controller ----

const play = (over: Partial<PlayInfo> = {}, clock = fakeClock()): PlayInfo => ({
  url: 'https://cdn.example.test/a.m4a?token=SECRET',
  expiresAt: new Date(clock.now() + 3_600_000).toISOString(),
  durationSec: 600,
  ...over,
});

function setup(options: { fetchPlay?: (id: string) => Promise<PlayInfo> } = {}) {
  const clock = fakeClock();
  const fake = fakeEngine();
  const saved: Array<[string, ProgressBody]> = [];
  const fetched: string[] = [];
  const controller = createPlayerController({
    engine: fake.engine,
    fetchPlay:
      options.fetchPlay ??
      (async (id) => {
        fetched.push(id);
        return play({}, clock);
      }),
    saveProgress: async (id, body) => void saved.push([id, body]),
    now: clock.now,
    sleepDeps: clock.deps,
  });
  return { clock, fake, saved, fetched, controller };
}

test('controller: open() asks for the signed URL, resumes where it was and starts playing', async () => {
  const { controller, fake, fetched } = setup();
  await controller.open({
    id: 'ep1',
    title: 'Айдастай нүүр тулах нь',
    artist: 'Онгод',
    artworkUrl: 'https://cdn.example.test/art-square.jpg',
    startAtSec: 125,
  });
  assert.deepEqual(fetched, ['ep1']);
  assert.deepEqual(fake.calls, ['load', 'play']);
  const load = fake.loads[0]!;
  assert.equal(load.startAtSec, 125);
  assert.equal(load.track.title, 'Айдастай нүүр тулах нь');
  assert.equal(load.track.artworkUrl, 'https://cdn.example.test/art-square.jpg');
  assert.equal(controller.getState().status, 'playing');
  assert.equal(controller.getState().episodeId, 'ep1');
});

test('controller: a refused play URL (no access) is reported and nothing starts', async () => {
  const refused = Object.assign(new Error('Таны эрх идэвхгүй байна.'), { code: 'NO_ACCESS' });
  const { controller, fake } = setup({
    fetchPlay: async () => {
      throw refused;
    },
  });
  await assert.rejects(controller.open({ id: 'ep1', title: 'x' }), refused);
  assert.deepEqual(fake.calls, [], 'no load, no play');
  assert.equal(controller.getState().error?.code, 'NO_ACCESS');
});

test('controller: a renewal refused mid-episode stops what is still buffered (re-audit)', async () => {
  const refused = Object.assign(new Error('Таны эрх идэвхгүй байна.'), { code: 'NO_ACCESS' });
  let allowed = true;
  const { controller, fake, clock, saved } = setup({
    fetchPlay: async () => {
      if (!allowed) throw refused;
      return play({}, clock);
    },
  });
  await controller.open({ id: 'ep1', title: 'x' });
  fake.push({ positionSec: 300 });
  // Access ended; the URL is about to run out and the member seeks.
  allowed = false;
  clock.advance(3_600_000 - URL_REFRESH_MARGIN_MS + 1);
  await assert.rejects(controller.seekTo(320), refused);
  assert.equal(fake.engine.getState().status, 'paused');
  assert.equal(controller.getState().error?.code, 'NO_ACCESS');
  await flush();
  assert.deepEqual(saved.at(-1)?.[0], 'ep1');
});

test('controller: a network error on renewal does not stop playback', async () => {
  const offline = Object.assign(new Error('offline'), { code: 'NETWORK' });
  let online = true;
  const { controller, fake, clock } = setup({
    fetchPlay: async () => {
      if (!online) throw offline;
      return play({}, clock);
    },
  });
  await controller.open({ id: 'ep1', title: 'x' });
  online = false;
  clock.advance(3_600_000 - URL_REFRESH_MARGIN_MS + 1);
  await assert.rejects(controller.seekTo(10), offline);
  assert.equal(fake.engine.getState().status, 'playing');
});

test('controller: pause saves progress, play resumes', async () => {
  const { controller, fake, saved } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  fake.push({ positionSec: 42.7 });
  controller.pause();
  await flush();
  assert.deepEqual(saved.at(-1), ['ep1', { positionSec: 42, completed: false }]);
  await controller.toggle();
  assert.equal(fake.engine.getState().status, 'playing');
  await controller.toggle();
  assert.equal(fake.engine.getState().status, 'paused');
});

test('controller: skip back 15 s and forward 30 s stay inside the episode', async () => {
  assert.equal(SKIP_BACK_SEC, 15);
  assert.equal(SKIP_FORWARD_SEC, 30);
  const { controller, fake } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  fake.push({ positionSec: 100 });
  await controller.skipBack();
  assert.equal(fake.engine.getState().positionSec, 85);
  await controller.skipForward();
  assert.equal(fake.engine.getState().positionSec, 115);
  fake.push({ positionSec: 5 });
  await controller.skipBack();
  assert.equal(fake.engine.getState().positionSec, 0, 'not before the start');
  fake.push({ positionSec: 590 });
  await controller.skipForward();
  assert.equal(fake.engine.getState().positionSec, 600, 'not past the end (duration 600)');
});

test('controller: the speed chip cycles through the engine', async () => {
  const { controller, fake } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  assert.equal(controller.cycleRate(), 1.25);
  assert.equal(controller.cycleRate(), 1.5);
  assert.equal(controller.cycleRate(), 2);
  assert.equal(controller.cycleRate(), 1);
  assert.deepEqual(
    fake.calls.filter((c) => c.startsWith('rate:')),
    ['rate:1.25', 'rate:1.5', 'rate:2', 'rate:1'],
  );
});

test('controller: the sleep timer pauses playback and saves the position', async () => {
  const { controller, fake, saved, clock } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  controller.startSleep(15);
  fake.push({ positionSec: 400 });
  clock.advance(15 * 60_000);
  await flush();
  assert.equal(fake.engine.getState().status, 'paused');
  assert.deepEqual(saved.at(-1), ['ep1', { positionSec: 400, completed: false }]);
  assert.equal(controller.getState().sleep.mode, null);
});

test('controller: "end of episode" stops at the end and marks the episode heard', async () => {
  const { controller, fake, saved } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  controller.startSleep('end');
  assert.equal(controller.getState().sleep.mode, 'end');
  fake.push({ status: 'ended', positionSec: 600 });
  await flush();
  assert.deepEqual(saved.at(-1), ['ep1', { positionSec: 600, completed: true }]);
  assert.equal(controller.getState().sleep.mode, null, 'used up');
});

test('controller: a sleep timer always blocks autoplay-next (ADR-0049)', async () => {
  const { controller, fake, clock } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  assert.equal(controller.getState().autoplayBlocked, false, 'no timer: allowed');

  controller.startSleep(30);
  assert.equal(controller.getState().autoplayBlocked, true, 'a timer is set');
  controller.cancelSleep();
  assert.equal(controller.getState().autoplayBlocked, false, 'cancelled: allowed again');

  controller.startSleep(15);
  clock.advance(15 * 60_000);
  await flush();
  assert.equal(controller.getState().sleep.mode, null);
  assert.equal(controller.getState().autoplayBlocked, true, 'it fired for this episode');

  await controller.open({ id: 'ep2', title: 'y' });
  assert.equal(controller.getState().autoplayBlocked, false, 'a new episode opened by hand');

  controller.startSleep('end');
  fake.push({ status: 'ended', positionSec: 600 });
  await flush();
  assert.equal(controller.getState().autoplayBlocked, true, '"end of episode" is used up');
});

test('controller: open() always asks the play endpoint, never a kept URL (ADR-0049)', async () => {
  const { controller, fetched } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  await controller.open({ id: 'ep2', title: 'y' });
  await controller.open({ id: 'ep1', title: 'x' });
  assert.deepEqual(fetched, ['ep1', 'ep2', 'ep1']);
});

test('controller: an expiring URL is replaced before playing and keeps the position', async () => {
  const { controller, fake, fetched, clock } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  controller.pause();
  fake.push({ positionSec: 321 });
  clock.advance(3_600_000 - URL_REFRESH_MARGIN_MS + 1_000);
  await controller.play();
  assert.deepEqual(fetched, ['ep1', 'ep1'], 'a second POST /play');
  assert.equal(fake.loads.length, 2);
  assert.equal(fake.loads[1]!.startAtSec, 321, 'resumes where it was');
  assert.equal(fake.engine.getState().status, 'playing');
});

test('controller: a URL with time left is not replaced', async () => {
  const { controller, fetched, clock } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  controller.pause();
  clock.advance(10 * 60_000);
  await controller.play();
  assert.deepEqual(fetched, ['ep1']);
});

test('controller: switching episodes saves the first one before the second loads', async () => {
  const { controller, fake, saved } = setup();
  await controller.open({ id: 'ep1', title: 'a' });
  fake.push({ positionSec: 77 });
  await controller.open({ id: 'ep2', title: 'b' });
  assert.deepEqual(saved[0], ['ep1', { positionSec: 77, completed: false }]);
  assert.equal(controller.getState().episodeId, 'ep2');
});

test('controller: close() saves, unloads (lock-screen controls go) and forgets the episode', async () => {
  const { controller, fake, saved } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  fake.push({ positionSec: 12 });
  controller.startSleep(30);
  await controller.close();
  assert.deepEqual(saved.at(-1), ['ep1', { positionSec: 12, completed: false }]);
  assert.equal(fake.calls.at(-1), 'unload');
  assert.equal(controller.getState().episodeId, null);
  assert.equal(controller.getState().sleep.mode, null);
});

// ---- video episodes (ADR-0038) ----

const videoPlay = (clock = fakeClock()): PlayInfo => ({
  kind: 'VIDEO',
  url: 'https://vz.example.test/bcdn_token=SECRET&expires=1&token_path=%2Fv%2F/v/playlist.m3u8',
  expiresAt: new Date(clock.now() + 3_600_000).toISOString(),
  durationSec: 2_700,
});

/** A controller with an audio and a video engine; `kinds` says what each episode id is. */
function setupMixed(kinds: Record<string, 'AUDIO' | 'VIDEO'>, withVideo = true) {
  const clock = fakeClock();
  const audio = fakeEngine();
  const video = fakeEngine();
  const saved: Array<[string, ProgressBody]> = [];
  const controller = createPlayerController({
    engine: audio.engine,
    ...(withVideo ? { videoEngine: video.engine } : {}),
    fetchPlay: async (id) => (kinds[id] === 'VIDEO' ? videoPlay(clock) : play({}, clock)),
    saveProgress: async (id, body) => void saved.push([id, body]),
    now: clock.now,
    sleepDeps: clock.deps,
  });
  return { clock, audio, video, saved, controller };
}

test('video: a VIDEO play URL plays through the video engine, the audio engine is not touched', async () => {
  const { controller, audio, video } = setupMixed({ v1: 'VIDEO' });
  assert.equal(controller.getState().kind, null, 'nothing loaded yet');
  await controller.open({
    id: 'v1',
    title: 'Видео дугаар',
    artist: 'Онгод',
    artworkUrl: 'https://cdn.example.test/art.jpg',
    startAtSec: 90,
  });
  assert.deepEqual(audio.calls, []);
  assert.deepEqual(video.calls, ['rate:1', 'load', 'play'], 'the speed chip carries over');
  const load = video.loads[0]!;
  assert.match(load.track.url, /playlist\.m3u8$/);
  assert.equal(load.startAtSec, 90, 'resumes where it was');
  assert.equal(load.track.title, 'Видео дугаар');
  assert.equal(load.track.artworkUrl, 'https://cdn.example.test/art.jpg', 'lock-screen picture');
  const state = controller.getState();
  assert.equal(state.kind, 'VIDEO');
  assert.equal(state.status, 'playing');
  assert.doesNotMatch(JSON.stringify(state), /SECRET|bcdn_token/, 'the signed URL stays out');
});

test('video: a play URL without a kind is audio', async () => {
  const { controller, audio, video } = setupMixed({});
  await controller.open({ id: 'a1', title: 'x' });
  assert.equal(controller.getState().kind, 'AUDIO');
  assert.deepEqual(audio.calls, ['load', 'play']);
  assert.deepEqual(video.calls, []);
});

test('video: switching kinds unloads the other engine first and keeps the speed', async () => {
  const { controller, audio, video, saved } = setupMixed({ a1: 'AUDIO', v1: 'VIDEO' });
  await controller.open({ id: 'a1', title: 'audio' });
  controller.cycleRate();
  audio.push({ positionSec: 30 });
  await controller.open({ id: 'v1', title: 'video' });
  assert.deepEqual(saved[0], ['a1', { positionSec: 30, completed: false }], 'audio saved first');
  assert.equal(audio.calls.at(-1), 'unload', 'one player owns the lock screen');
  assert.deepEqual(video.calls, ['rate:1.25', 'load', 'play']);
  assert.equal(controller.getState().kind, 'VIDEO');
  assert.equal(controller.getState().rate, 1.25);

  await controller.open({ id: 'a1', title: 'audio again' });
  assert.equal(video.calls.at(-1), 'unload');
  assert.deepEqual(audio.calls.slice(-3), ['rate:1.25', 'load', 'play']);
  assert.equal(controller.getState().kind, 'AUDIO');
});

test('video: the idle engine cannot change the state or the saved progress', async () => {
  const { controller, audio, video, saved } = setupMixed({ v1: 'VIDEO' });
  await controller.open({ id: 'v1', title: 'video' });
  video.push({ positionSec: 500 });
  audio.push({ status: 'ended', positionSec: 0 });
  await flush();
  assert.equal(controller.getState().status, 'playing');
  assert.equal(controller.getState().positionSec, 500);
  assert.ok(!saved.some(([, body]) => body.completed), 'not marked heard by the idle engine');
});

test('video: progress, speed, skip and the sleep timer work the same as audio', async () => {
  const { controller, video, saved, clock } = setupMixed({ v1: 'VIDEO' });
  await controller.open({ id: 'v1', title: 'video' });
  video.push({ positionSec: 100 });
  await controller.skipForward();
  assert.equal(video.engine.getState().positionSec, 130);
  assert.equal(controller.cycleRate(), 1.25);
  assert.equal(video.engine.getState().rate, 1.25);

  controller.startSleep(15);
  video.push({ positionSec: 400 });
  clock.advance(15 * 60_000);
  await flush();
  await flush(); // the save after the skip goes first (one request at a time)
  assert.equal(video.engine.getState().status, 'paused', 'sleep timer pauses the video');
  assert.deepEqual(saved.at(-1), ['v1', { positionSec: 400, completed: false }]);

  await controller.play();
  controller.startSleep('end');
  video.push({ status: 'ended', positionSec: 600 });
  await flush();
  assert.deepEqual(saved.at(-1), ['v1', { positionSec: 600, completed: true }]);
  assert.equal(controller.getState().sleep.mode, null);
});

test('video: an expiring URL is replaced on the same video engine', async () => {
  const { controller, audio, video, clock } = setupMixed({ v1: 'VIDEO' });
  await controller.open({ id: 'v1', title: 'video' });
  controller.pause();
  video.push({ positionSec: 1_234 });
  clock.advance(3_600_000 - URL_REFRESH_MARGIN_MS + 1_000);
  await controller.play();
  assert.equal(video.loads.length, 2);
  assert.equal(video.loads[1]!.startAtSec, 1_234);
  assert.ok(!video.calls.includes('unload'), 'no switch for the same kind');
  assert.deepEqual(audio.calls, []);
});

test('video: close() unloads the video and forgets the kind', async () => {
  const { controller, video } = setupMixed({ v1: 'VIDEO' });
  await controller.open({ id: 'v1', title: 'video' });
  await controller.close();
  assert.equal(video.calls.at(-1), 'unload');
  assert.equal(controller.getState().kind, null);
  assert.equal(controller.getState().episodeId, null);
});

test('video: without a video engine a video episode reports an error and nothing plays', async () => {
  const { controller, audio } = setupMixed({ v1: 'VIDEO' }, false);
  await assert.rejects(controller.open({ id: 'v1', title: 'video' }), { code: VIDEO_UNSUPPORTED });
  assert.deepEqual(audio.calls, []);
  assert.equal(controller.getState().error?.code, VIDEO_UNSUPPORTED);
  assert.equal(controller.getState().kind, null);
});

test('the app calls POST /episodes/:id/play and PUT /progress/:id', async () => {
  const seen: Array<{ path: string; method?: string; body?: unknown }> = [];
  const client = {
    request: async (path: string, options: { method?: string; body?: unknown }) => {
      seen.push({ path, ...options });
      return undefined;
    },
    getRefreshToken: async () => null,
  } as unknown as Parameters<typeof createEndpoints>[0];
  const endpoints = createEndpoints(client);
  await endpoints.playEpisode('ep 1');
  await endpoints.saveProgress('ep1', { positionSec: 42, completed: false });
  assert.deepEqual(
    seen.map((call) => [call.method, call.path, call.body]),
    [
      ['POST', '/episodes/ep%201/play', undefined],
      ['PUT', '/progress/ep1', { positionSec: 42, completed: false }],
    ],
  );
});

test('the signed URL never ends up in the controller state', async () => {
  const { controller } = setup();
  await controller.open({ id: 'ep1', title: 'x' });
  assert.doesNotMatch(JSON.stringify(controller.getState()), /SECRET|token=/);
});
