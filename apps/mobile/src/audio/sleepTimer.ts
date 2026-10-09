/** Sleep timer choices: 15, 30 or 45 minutes, or "end of episode" (DESIGN.md "Player"). */
export const SLEEP_MINUTES = [15, 30, 45] as const;
export type SleepMode = (typeof SLEEP_MINUTES)[number] | 'end';

export interface SleepState {
  mode: SleepMode | null;
  /** Wall-clock ms when a minute timer fires; null for "end" and when off. */
  endsAt: number | null;
}

export interface SleepTimerDeps {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const realDeps: SleepTimerDeps = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Runs in JS (the OS has no sleep timer for us). A minute timer fires `onExpire` after that many
 * minutes of wall-clock time; "end" fires when the controller reports the episode ended.
 */
export function createSleepTimer(onExpire: () => void, deps: SleepTimerDeps = realDeps) {
  let state: SleepState = { mode: null, endsAt: null };
  let handle: unknown;
  const listeners = new Set<(state: SleepState) => void>();

  const set = (next: SleepState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const clear = () => {
    if (handle !== undefined) deps.clearTimeout(handle);
    handle = undefined;
  };

  const fire = () => {
    clear();
    set({ mode: null, endsAt: null });
    onExpire();
  };

  return {
    getState: (): SleepState => state,
    /** Starting a new choice replaces the old one. */
    start(mode: SleepMode) {
      clear();
      if (mode === 'end') {
        set({ mode, endsAt: null });
        return;
      }
      const ms = mode * 60_000;
      set({ mode, endsAt: deps.now() + ms });
      handle = deps.setTimeout(fire, ms);
    },
    cancel() {
      clear();
      if (state.mode !== null) set({ mode: null, endsAt: null });
    },
    /** Milliseconds left of a minute timer (0 when off or "end"). */
    remainingMs: (): number => (state.endsAt === null ? 0 : Math.max(0, state.endsAt - deps.now())),
    /**
     * The episode reached its end. Returns true when "end of episode" was chosen: it is used up
     * and the caller must not start anything else (no next episode).
     */
    episodeEnded(): boolean {
      if (state.mode !== 'end') return false;
      fire();
      return true;
    },
    onChange(listener: (state: SleepState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SleepTimer = ReturnType<typeof createSleepTimer>;
