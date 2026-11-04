/**
 * Per-host politeness: at most `maxConcurrent` requests in flight and at least `gapMs` between
 * request starts to the same host. Clock and sleep are injectable so tests run instantly.
 */
export interface HostLimits {
  gapMs: number;
  maxConcurrent: number;
}

export const DEFAULT_LIMITS: HostLimits = { gapMs: 1500, maxConcurrent: 2 };

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface HostState {
  active: number;
  nextStart: number;
  waiters: (() => void)[];
}

/** Never looser than the defaults: a merchant config can slow a host down, not speed it up. */
export function clampLimits(config: { throttleMs?: number; maxConcurrency?: number } = {}) {
  return {
    gapMs: Math.max(DEFAULT_LIMITS.gapMs, Number(config.throttleMs) || 0),
    maxConcurrent: Math.max(
      1,
      Math.min(DEFAULT_LIMITS.maxConcurrent, Number(config.maxConcurrency) || Infinity),
    ),
  };
}

export class HostLimiter {
  private hosts = new Map<string, HostState>();

  constructor(private clock: Clock = realClock) {}

  private state(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = { active: 0, nextStart: 0, waiters: [] };
      this.hosts.set(host, s);
    }
    return s;
  }

  async run<T>(host: string, limits: HostLimits, fn: () => Promise<T>): Promise<T> {
    const s = this.state(host);
    while (s.active >= limits.maxConcurrent) await new Promise<void>((r) => s.waiters.push(r));
    s.active++;
    try {
      const slot = Math.max(this.clock.now(), s.nextStart);
      s.nextStart = slot + limits.gapMs;
      const wait = slot - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      return await fn();
    } finally {
      s.active--;
      s.waiters.shift()?.();
    }
  }
}
