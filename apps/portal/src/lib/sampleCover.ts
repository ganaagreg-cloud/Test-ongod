import { mountainLine, themes } from '@ongod/tokens';

/**
 * Placeholder cover drawn from the design tokens (heritage green + one gold mountain line).
 * TODO(owner): replace the three landing samples with real episode covers.
 */
export const sampleCover = (shift: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 160 160"><rect width="160" height="160" fill="${themes.dark.heritage}"/><path d="${mountainLine.path}" transform="translate(0 ${60 + shift})" fill="none" stroke="${themes.dark.accent}" stroke-width="${mountainLine.strokeWidth}"/></svg>`,
  )}`;
