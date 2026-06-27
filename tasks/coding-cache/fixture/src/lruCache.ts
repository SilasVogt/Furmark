export type CacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
};

type Entry<Value> = {
  value: Value;
  expiresAt: number | null;
};

export type LruCacheOptions = {
  maxSize: number;
  ttlMs?: number;
  now?: () => number;
};

export class LruCache<Key, Value> {
  readonly #maxSize: number;
  readonly #ttlMs: number | null;
  readonly #now: () => number;
  readonly #entries = new Map<Key, Entry<Value>>();
  readonly #stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expired: 0,
  };

  constructor(options: LruCacheOptions) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new Error("maxSize must be a positive integer");
    }
    if (options.ttlMs !== undefined && (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0)) {
      throw new Error("ttlMs must be a positive number");
    }
    this.#maxSize = options.maxSize;
    this.#ttlMs = options.ttlMs ?? null;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    this.#pruneExpired();
    return this.#entries.size;
  }

  get stats(): CacheStats {
    return { ...this.#stats };
  }

  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (!entry) {
      this.#stats.misses += 1;
      return undefined;
    }
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      this.#stats.expired += 1;
      this.#stats.misses += 1;
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    this.#stats.hits += 1;
    return entry.value;
  }

  has(key: Key): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      this.#stats.expired += 1;
      return false;
    }
    return true;
  }

  set(key: Key, value: Value, ttlMs = this.#ttlMs): void {
    if (ttlMs !== null && (!Number.isFinite(ttlMs) || ttlMs <= 0)) {
      throw new Error("ttlMs must be a positive number");
    }
    if (this.#entries.has(key)) this.#entries.delete(key);
    this.#entries.set(key, {
      value,
      expiresAt: ttlMs === null ? null : this.#now() + ttlMs,
    });
    this.#evictOverflow();
  }

  delete(key: Key): boolean {
    return this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  #evictOverflow(): void {
    while (this.#entries.size > this.#maxSize) {
      const oldestKey = this.#entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) return;
      this.#entries.delete(oldestKey);
      this.#stats.evictions += 1;
    }
  }

  #pruneExpired(): void {
    for (const [key, entry] of this.#entries) {
      if (this.#isExpired(entry)) {
        this.#entries.delete(key);
        this.#stats.expired += 1;
      }
    }
  }

  #isExpired(entry: Entry<Value>): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= this.#now();
  }
}

