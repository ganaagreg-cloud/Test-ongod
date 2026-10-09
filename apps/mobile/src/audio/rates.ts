/** Playback speeds the player offers (DESIGN.md "Player"). expo-audio on Android allows 0.1 to 2.0. */
export const RATES = [1, 1.25, 1.5, 2] as const;
export type Rate = (typeof RATES)[number];

/** The speed chip cycles 1x -> 1.25x -> 1.5x -> 2x -> 1x. An unknown rate starts again at 1x. */
export function nextRate(current: number): Rate {
  const index = RATES.findIndex((rate) => rate === current);
  return RATES[(index + 1) % RATES.length]!;
}

/** "1x", "1.25x" */
export const rateLabel = (rate: number): string => `${rate}x`;
