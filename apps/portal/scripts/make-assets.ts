// Draws the favicon (SVG) and the Open Graph image (1200x630 PNG) from the design tokens, so the
// colors and the mountain line match the app. Run after changing the brand or the tokens:
//   pnpm --filter @ongod/portal assets
// Output goes to apps/portal/public and is committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { mountainLine, themes } from '@ongod/tokens';

const require = createRequire(import.meta.url);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(publicDir, { recursive: true });
const c = themes.dark;

// ---- favicon: the gold mountain line on the heritage green ----
writeFileSync(
  `${publicDir}favicon.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="32" fill="${c.heritage}"/><path d="${mountainLine.path}" transform="translate(0 56) scale(1)" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
);

// ---- Open Graph image ----
// Fonts are embedded as data URLs: a page set from a string cannot load file:// URLs.
const font = (pkg: string, file: string) =>
  `data:font/woff2;base64,${readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`)).toString('base64')}`;

const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>
@font-face{font-family:Lora;font-weight:600;src:url(${font('lora', 'lora-cyrillic-600-normal.woff2')})}
@font-face{font-family:Lora;font-weight:600;src:url(${font('lora', 'lora-cyrillic-ext-600-normal.woff2')});unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}
@font-face{font-family:Inter;font-weight:400;src:url(${font('inter', 'inter-cyrillic-400-normal.woff2')})}
@font-face{font-family:Inter;font-weight:400;src:url(${font('inter', 'inter-cyrillic-ext-400-normal.woff2')});unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${c.bg};color:${c.textPrimary};display:flex;flex-direction:column;justify-content:center;gap:28px;padding:0 96px;font-family:Inter,sans-serif;position:relative;overflow:hidden}
.mountain{position:absolute;right:-40px;bottom:-10px;width:760px;height:228px;opacity:.9}
h1{font:600 120px/1.05 Lora,serif}
p{font:400 40px/1.35 Inter,sans-serif;color:${c.textSecondary};max-width:640px}
</style></head><body>
<svg class="mountain" viewBox="${mountainLine.viewBox}" fill="none" stroke="${c.accent}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="${mountainLine.path}"/></svg>
<h1>Онгод</h1><p>Гишүүдэд зориулсан аудио сан</p>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${publicDir}og.png` });
} finally {
  await browser.close();
}
console.log('wrote public/favicon.svg and public/og.png');
