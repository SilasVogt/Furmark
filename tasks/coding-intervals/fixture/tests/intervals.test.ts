import { describe, expect, it } from "vitest";
import { coalesceIntervals } from "../src/intervals";

describe("coalesceIntervals", () => {
  it("merges overlaps deterministically", () => {
    expect(
      coalesceIntervals([
        { start: 5, end: 8 },
        { start: 1, end: 3 },
        { start: 2, end: 6 },
      ]),
    ).toEqual([{ start: 1, end: 8 }]);
  });

  it("can keep touching intervals separate", () => {
    expect(
      coalesceIntervals(
        [
          { start: 1, end: 2 },
          { start: 2, end: 3 },
        ],
        { mergeTouching: false },
      ),
    ).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it("normalizes reversed and negative ranges", () => {
    expect(
      coalesceIntervals([
        { start: 4, end: -1 },
        { start: -3, end: -2 },
      ]),
    ).toEqual([{ start: -3, end: 4 }]);
  });

  it("rejects invalid endpoints", () => {
    expect(() => coalesceIntervals([{ start: 1, end: Number.NaN }])).toThrow(/finite/);
  });
});

