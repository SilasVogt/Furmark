export type Interval = {
  start: number;
  end: number;
};

export type CoalesceOptions = {
  mergeTouching?: boolean;
};

export function coalesceIntervals(intervals: readonly Interval[], options: CoalesceOptions = {}): Interval[] {
  const mergeTouching = options.mergeTouching ?? true;
  const normalized = intervals.map(normalizeInterval).sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Interval[] = [];

  for (const interval of normalized) {
    const last = result.at(-1);
    if (!last) {
      result.push({ ...interval });
      continue;
    }
    const overlaps = mergeTouching ? interval.start <= last.end : interval.start < last.end;
    if (overlaps) {
      last.end = Math.max(last.end, interval.end);
    } else {
      result.push({ ...interval });
    }
  }

  return result;
}

function normalizeInterval(interval: Interval): Interval {
  assertFinite(interval.start, "start");
  assertFinite(interval.end, "end");
  return interval.start <= interval.end
    ? { start: interval.start, end: interval.end }
    : { start: interval.end, end: interval.start };
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`Interval ${label} must be finite`);
}

