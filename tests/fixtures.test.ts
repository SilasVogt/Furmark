import { describe, expect, it } from "vitest";
import { LruCache } from "../tasks/coding-cache/fixture/src/lruCache";
import { coalesceIntervals } from "../tasks/coding-intervals/fixture/src/intervals";
import { DependencyCycleError, dependencyBatches } from "../tasks/coding-dependency-batches/fixture/src/dependencyBatches";

describe("pure coding fixtures", () => {
  it("covers LRU TTL cache behavior", () => {
    let now = 0;
    const cache = new LruCache<string, number>({ maxSize: 2, ttlMs: 10, now: () => now });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    now = 11;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats.evictions).toBe(1);
    expect(cache.stats.expired).toBe(1);
  });

  it("covers interval edge cases", () => {
    expect(
      coalesceIntervals([
        { start: 10, end: 7 },
        { start: 1, end: 3 },
        { start: 3, end: 5 },
      ]),
    ).toEqual([
      { start: 1, end: 5 },
      { start: 7, end: 10 },
    ]);
    expect(() => coalesceIntervals([{ start: Number.POSITIVE_INFINITY, end: 1 }])).toThrow(/finite/);
  });

  it("covers dependency batches and cycles", () => {
    expect(dependencyBatches({ build: ["lint", "test"], test: ["install"], lint: ["install"] })).toEqual([
      ["install"],
      ["lint", "test"],
      ["build"],
    ]);
    expect(() => dependencyBatches({ a: ["b"], b: ["a"] })).toThrow(DependencyCycleError);
  });
});

