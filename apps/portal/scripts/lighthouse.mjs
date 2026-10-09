// Lighthouse (mobile preset: emulated phone, simulated slow 4G) against the production build,
// served by the real API process the way production serves it.
//
//   pnpm build && pnpm --filter @ongod/portal lighthouse
//
// Audits the public pages (the ones behind the login keep their access token in memory only, so
// they cannot be audited from a cold start). Each page runs LH_RUNS times (default 3) and the
// median is reported. Writes docs/reports/lighthouse-portal.md.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const RUNS = Number(process.env.LH_RUNS ?? 3);
const PAGES = ['/', '/plans', '/login', '/register', '/privacy', '/terms', '/delete-account'];
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
};

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// ---- the API process, serving apps/portal/dist at / ----
const server = spawn(process.execPath, ['--env-file=.env', 'apps/api/dist/server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    PUBLIC_BASE_URL: BASE,
    SERVE_STATIC: 'true',
    JOB_WORKER_ENABLED: 'false',
    LOG_LEVEL: 'silent',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stopServer = () => server.kill();
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the API did not start (is the build there? run pnpm build first)');
}

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
const results = [];
try {
  await waitForServer();
  for (const path of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { lhr } = await lighthouse(`${BASE}${path}`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: CATEGORIES,
      });
      runs.push(lhr);
    }
    const score = (lhr, id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
    const metric = (lhr, key) => lhr.audits[METRICS[key]].numericValue;
    // The run whose performance score is the median represents the page.
    const representative = [...runs].sort(
      (a, b) => score(a, 'performance') - score(b, 'performance'),
    )[Math.floor(runs.length / 2)];
    const failing = Object.values(representative.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
      .map((a) => `${a.id} (${a.title})`);
    results.push({
      path,
      performance: median(runs.map((r) => score(r, 'performance'))),
      accessibility: median(runs.map((r) => score(r, 'accessibility'))),
      bestPractices: median(runs.map((r) => score(r, 'best-practices'))),
      seo: median(runs.map((r) => score(r, 'seo'))),
      fcp: Math.round(median(runs.map((r) => metric(r, 'fcp')))),
      lcp: Math.round(median(runs.map((r) => metric(r, 'lcp')))),
      tbt: Math.round(median(runs.map((r) => metric(r, 'tbt')))),
      cls: Number(median(runs.map((r) => metric(r, 'cls'))).toFixed(3)),
      si: Math.round(median(runs.map((r) => metric(r, 'si')))),
      failing,
    });
    console.log(
      `${path.padEnd(18)} perf ${results.at(-1).performance}  a11y ${results.at(-1).accessibility}`,
    );
  }
} finally {
  await chrome.kill();
  stopServer();
}

const date = new Date().toISOString().slice(0, 10);
const rows = results
  .map(
    (r) =>
      `| \`${r.path}\` | ${r.performance} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.fcp} | ${r.lcp} | ${r.tbt} | ${r.cls} | ${r.si} |`,
  )
  .join('\n');
const notes = results
  .filter((r) => r.failing.length > 0)
  .map((r) => `- \`${r.path}\`: ${r.failing.join('; ')}`)
  .join('\n');
const report = `---
type: report
date: ${date}
tags: [report, area/web]
---

# Lighthouse: portal (mobile)

Mobile preset (emulated phone, simulated slow 4G), production build served by the API process, median of ${RUNS} runs per page, Lighthouse ${(await import('lighthouse/package.json', { with: { type: 'json' } })).default.version}. Times in ms. Pages behind the login are not audited (the access token lives in memory only).

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Speed index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Audits that did not pass

${notes || 'None.'}
`;
mkdirSync(`${root}docs/reports`, { recursive: true });
writeFileSync(`${root}docs/reports/lighthouse-portal.md`, report);
console.log('\nwrote docs/reports/lighthouse-portal.md');

const worst = (key) => Math.min(...results.map((r) => r[key]));
console.log(
  `lowest performance ${worst('performance')}, lowest accessibility ${worst('accessibility')}`,
);
process.exit(worst('performance') >= 90 && worst('accessibility') >= 90 ? 0 : 1);
