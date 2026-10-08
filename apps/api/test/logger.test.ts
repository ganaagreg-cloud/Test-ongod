import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger';

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('log file', () => {
  it('writes JSON lines to a dated, rotating file and redacts secrets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ongod-logs-'));
    const logger = createLogger({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      LOG_FILE: join(dir, 'api.log'),
      LOG_FILE_MAX_SIZE: '1m',
      LOG_FILE_COUNT: 3,
    });

    logger.info({ req: { headers: { 'x-cron-secret': 'top-secret' } } }, 'hello file');

    const content = await waitFor(() => {
      const file = readdirSync(dir).find((f) => /^api\.\d{4}-\d{2}-\d{2}\.1\.log$/.test(f));
      const text = file && readFileSync(join(dir, file), 'utf8');
      return text?.includes('hello file') ? text : undefined;
    });
    const line = JSON.parse(content.trim().split('\n').at(-1)!);
    expect(line).toMatchObject({ level: 30, msg: 'hello file' });
    expect(content).not.toContain('top-secret');
  });
});
