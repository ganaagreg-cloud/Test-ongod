import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors';

/**
 * Fixed-window counter in memory. The API is a single process (CLAUDE.md), so no shared
 * store is needed; counters reset on restart, which is acceptable for brute-force limits.
 */
export class WindowCounter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt. Returns false once the key is over its limit. */
  hit(key: string): boolean {
    const now = this.now();
    this.sweep(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

export interface AuthLimiterConfig {
  ipMax: number;
  identifierMax: number;
  windowSeconds: number;
}

/** Limits an auth endpoint per client IP and per identifier (email, username or user id). */
export class AuthLimiter {
  private readonly byIp: WindowCounter;
  private readonly byIdentifier: WindowCounter;

  constructor(cfg: AuthLimiterConfig, now?: () => number) {
    const windowMs = cfg.windowSeconds * 1000;
    this.byIp = new WindowCounter(cfg.ipMax, windowMs, now);
    this.byIdentifier = new WindowCounter(cfg.identifierMax, windowMs, now);
  }

  /** Throws 429 RATE_LIMITED when either the IP or the identifier is over its limit. */
  check(req: FastifyRequest, scope: string, identifier: string): void {
    // Both counters are always hit, so one blocked key never hides the other's count.
    const ipOk = this.byIp.hit(`${scope}:${req.ip}`);
    const idOk = this.byIdentifier.hit(`${scope}:${identifier.toLowerCase()}`);
    if (!ipOk || !idOk) throw new AppError(429, 'RATE_LIMITED');
  }

  /**
   * Per identifier only, for calls whose credential is unguessable (refresh tokens). A per-IP
   * limit here locks out everyone behind one carrier IP (audit C-01).
   */
  checkIdentifier(scope: string, identifier: string): void {
    if (!this.byIdentifier.hit(`${scope}:${identifier.toLowerCase()}`)) {
      throw new AppError(429, 'RATE_LIMITED');
    }
  }
}
