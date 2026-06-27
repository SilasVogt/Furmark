import { describe, expect, it } from "vitest";
import { LruCache } from "../src/lruCache";

describe("LruCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new LruCache<string, number>({ maxSize: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.stats.evictions).toBe(1);
  });

  it("expires entries and counts expired misses", () => {
    let now = 1000;
    const cache = new LruCache<string, string>({ maxSize: 2, ttlMs: 50, now: () => now });
    cache.set("token", "abc");
    now = 1051;
    expect(cache.get("token")).toBeUndefined();
    expect(cache.stats.expired).toBe(1);
    expect(cache.stats.misses).toBe(1);
  });

  it("updates values and clears entries without resetting stats", () => {
    const cache = new LruCache<string, number>({ maxSize: 1 });
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.get("a")).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.stats.hits).toBe(1);
  });
});

