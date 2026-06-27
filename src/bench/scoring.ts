import type { Scores, TaskSpec } from "./schema";

export type ScoreInput = {
  task: TaskSpec;
  exitCode: number | null;
  finalText: string;
  diffText: string;
  metrics: Record<string, unknown>;
  screenshotCount: number;
  setupSkipped?: boolean;
};

const WEIGHTS = {
  correctness: 0.35,
  visual: 0.15,
  animation: 0.15,
  codeQuality: 0.2,
  styleCompliance: 0.15,
} as const;

export function scoreRun(input: ScoreInput): Scores {
  if (input.setupSkipped) return zeroScores(null);

  const correctness = scoreCorrectness(input.exitCode, input.metrics);
  const visual = scoreVisual(input.task, input.metrics, input.screenshotCount);
  const animation = scoreAnimation(input.task, input.metrics);
  const codeQuality = scoreCodeQuality(input.diffText);
  const styleCompliance = scoreStyleCompliance(input.finalText, input.diffText);
  const total = roundScore(
    correctness * WEIGHTS.correctness +
      visual * WEIGHTS.visual +
      animation * WEIGHTS.animation +
      codeQuality * WEIGHTS.codeQuality +
      styleCompliance * WEIGHTS.styleCompliance,
  );

  return {
    correctness,
    visual,
    animation,
    codeQuality,
    styleCompliance,
    skillUplift: null,
    total,
  };
}

export function withSkillUplifts(runs: { scores: Scores; agent: string; taskId: string; mode: string }[]): void {
  const baselines = new Map<string, number>();
  for (const run of runs) {
    if (run.mode === "baseline") baselines.set(`${run.agent}:${run.taskId}`, run.scores.total);
  }
  for (const run of runs) {
    const baseline = baselines.get(`${run.agent}:${run.taskId}`);
    run.scores.skillUplift = baseline === undefined ? null : roundScore(run.scores.total - baseline);
  }
}

function scoreCorrectness(exitCode: number | null, metrics: Record<string, unknown>): number {
  const passRate = numberMetric(metrics.testPassRate);
  if (passRate !== null) return roundScore(passRate * 100);
  if (metrics.typecheck === false || metrics.runtimeErrors === true) return 35;
  return exitCode === 0 ? 85 : 20;
}

function scoreVisual(task: TaskSpec, metrics: Record<string, unknown>, screenshotCount: number): number {
  if (task.category === "pure-coding") return 100;
  let score = screenshotCount > 0 ? 55 : 0;
  if (metrics.nonblankPixels === true) score += 20;
  if (metrics.responsiveRender === true) score += 15;
  if (metrics.consoleErrors === 0) score += 10;
  return clamp(score);
}

function scoreAnimation(task: TaskSpec, metrics: Record<string, unknown>): number {
  if (task.category !== "browser-animation") return 100;
  let score = 20;
  if (numberMetric(metrics.frameDifference) !== null && numberMetric(metrics.frameDifference)! > 0.02) score += 40;
  if (metrics.pauseBehavior === true) score += 20;
  if (metrics.reducedMotion === true) score += 20;
  return clamp(score);
}

function scoreCodeQuality(diffText: string): number {
  const changedLines = diffText.split(/\r?\n/).filter((line) => /^[+-]/.test(line) && !/^[+-]{3}/.test(line)).length;
  const fileCount = new Set(
    diffText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("diff --git "))
      .map((line) => line.split(" b/")[1] ?? line),
  ).size;
  const anyCount = (diffText.match(/\bany\b/g) ?? []).length;
  const bannedPatterns = [/eval\(/, /innerHTML\s*=/, /dangerouslySetInnerHTML/].filter((pattern) => pattern.test(diffText)).length;
  return clamp(100 - Math.max(0, changedLines - 220) * 0.08 - Math.max(0, fileCount - 12) * 2 - anyCount * 2 - bannedPatterns * 20);
}

function scoreStyleCompliance(finalText: string, diffText: string): number {
  const combined = `${finalText}\n${diffText}`;
  let score = 100;
  if (/[—–]/.test(finalText)) score -= 25;
  if (/\b(delve|tapestry|boasts|it's worth noting|in conclusion)\b/i.test(finalText)) score -= 20;
  if (/\b(rawr|owo|uwu|mrrp|tail wag|paws)\b/i.test(diffText)) score -= 30;
  if (combined.length > 80_000) score -= 10;
  return clamp(score);
}

function zeroScores(skillUplift: number | null): Scores {
  return {
    correctness: 0,
    visual: 0,
    animation: 0,
    codeQuality: 0,
    styleCompliance: 0,
    skillUplift,
    total: 0,
  };
}

function numberMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number): number {
  return roundScore(Math.max(0, Math.min(100, value)));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

