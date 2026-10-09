// `pnpm dev`: the whole local preview in one command. DEV ONLY (never run in production).
//
//   1. docker compose: MySQL + Mailpit        2. migrations, demo data on first run
//   3. API + portal + admin, output prefixed  4. prints every local URL when they answer
//
// Stop with Ctrl+C. The containers keep running (fast restart); `pnpm dev:down` stops them.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('pnpm dev is for local development only.');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const isWindows = process.platform === 'win32';

const color = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
const say = (text = '') => console.log(text);
const step = (text) => say(color(36, `\n▸ ${text}`));
const fail = (text) => {
  console.error(color(31, `\n✖ ${text}`));
  process.exit(1);
};

/** KEY=value pairs of .env; only used for ports, never printed. */
function readEnv() {
  const out = {};
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) fail(`${label} failed (exit ${result.status}).`);
}

// ---- 0. checks ----
if (!existsSync(envFile)) {
  fail('No .env file. Copy .env.example to .env and fill in the passwords and secrets first.');
}
const env = readEnv();
const ports = {
  api: Number(env.PORT ?? 3000),
  portal: 5173,
  admin: 5174,
  mailpit: 8025,
  studio: 51212,
  mobileWeb: 8081,
};

step('Docker: MySQL + Mailpit');
const docker = spawnSync('docker', ['info'], { cwd: root, shell: isWindows, stdio: 'ignore' });
if (docker.status !== 0)
  fail('Docker is not running. Start Docker Desktop, then run pnpm dev again.');
run('docker', ['compose', 'up', '-d', '--wait', 'mysql', 'mailpit'], 'docker compose up');

step('Database: migrations and demo data');
run('pnpm', ['--filter', '@ongod/api', 'db:deploy'], 'prisma migrate deploy');
run('pnpm', ['--filter', '@ongod/api', 'dev:setup'], 'dev setup');

// ---- 1. start the three dev servers ----
step('Starting API, portal and admin');
const children = [];

function start(name, colorCode, args) {
  const child = spawn('pnpm', args, {
    cwd: root,
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = color(colorCode, `[${name}]`.padEnd(9));
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.on('data', (chunk) => {
      const lines = (pending + chunk.toString()).split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(color(31, `\n✖ ${name} stopped (exit ${code}). Stopping everything.`));
      stop(1);
    }
  });
  children.push(child);
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    // `pnpm` starts grandchildren (tsx, vite): kill the whole tree.
    if (isWindows)
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  say(color(2, '\nStopped. Containers are still running: pnpm dev:down stops MySQL and Mailpit.'));
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('api', 33, ['--filter', '@ongod/api', 'dev']);
start('portal', 35, ['--filter', '@ongod/portal', 'dev']);
start('admin', 34, ['--filter', '@ongod/admin', 'dev']);

// ---- 2. wait until they answer, then print the URLs ----
async function waitFor(url, label, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  fail(`${label} did not answer at ${url} within ${seconds} s.`);
}

await Promise.all([
  waitFor(`http://localhost:${ports.api}/health`, 'API'),
  waitFor(`http://localhost:${ports.portal}/`, 'Portal'),
  waitFor(`http://localhost:${ports.admin}/admin/`, 'Admin'),
]);

const rows = [
  ['Portal', `http://localhost:${ports.portal}`, 'UI kit: /dev/ui'],
  ['Admin', `http://localhost:${ports.admin}/admin/`, ''],
  ['API', `http://localhost:${ports.api}`, '/health'],
  ['API docs', `http://localhost:${ports.api}/docs`, 'click and try every endpoint'],
  ['Mailpit', `http://localhost:${ports.mailpit}`, 'verification emails land here'],
  ['DB tables', `http://localhost:${ports.studio}`, 'run: pnpm db:studio'],
  [
    'Mobile web',
    `http://localhost:${ports.mobileWeb}`,
    'run: pnpm dev:mobile:web (UI kit: /dev/ui)',
  ],
];
const width = Math.max(...rows.map((r) => r[0].length));
const urlWidth = Math.max(...rows.map((r) => r[1].length));
say(color(32, '\n✔ Ready. Local preview:\n'));
for (const [name, url, note] of rows) {
  say(`  ${color(1, name.padEnd(width))}  ${url.padEnd(urlWidth)}  ${color(2, note)}`);
}
say(
  color(
    2,
    `\n  Seeded logins: owner, bat, demo, saraa, tuya, temuujin (passwords: SEED_* in .env)\n  Admin 2FA code for /docs: pnpm dev:totp   ·   Stop: Ctrl+C   ·   Containers: pnpm dev:down\n`,
  ),
);
