import { z } from "zod";

export const AgentIdSchema = z.enum(["claude-code", "opencode", "codex"]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const ModeSchema = z.enum(["baseline", "ponytail", "furry"]);
export type Mode = z.infer<typeof ModeSchema>;

export const TaskCategorySchema = z.enum(["landing-page", "browser-animation", "pure-coding"]);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const TaskIdSchema = z.enum([
  "landing-incident-console",
  "landing-civic-booking",
  "landing-hardware-studio",
  "animation-orbit-field",
  "animation-scroll-machine",
  "animation-data-rain",
  "coding-cache",
  "coding-intervals",
  "coding-dependency-batches",
]);
export type TaskId = z.infer<typeof TaskIdSchema>;

export const ScoreSchema = z.object({
  correctness: z.number().min(0).max(100),
  visual: z.number().min(0).max(100),
  animation: z.number().min(0).max(100),
  codeQuality: z.number().min(0).max(100),
  styleCompliance: z.number().min(0).max(100),
  skillUplift: z.number().nullable(),
  total: z.number().min(0).max(100),
});
export type Scores = z.infer<typeof ScoreSchema>;

export const TokenUsageSchema = z
  .object({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    reasoningTokens: z.number().nonnegative().optional(),
    totalTokens: z.number().nonnegative().optional(),
  })
  .nullable();
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const ArtifactUrlsSchema = z.object({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  final: z.string().optional(),
  events: z.string().optional(),
  diff: z.string().optional(),
  metrics: z.string().optional(),
  verification: z.string().optional(),
  playwrightReport: z.string().optional(),
  screenshots: z.array(z.string()).default([]),
});
export type ArtifactUrls = z.infer<typeof ArtifactUrlsSchema>;

export const StructuredErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.string().optional(),
});
export type StructuredError = z.infer<typeof StructuredErrorSchema>;

export const RunResultSchema = z.object({
  runId: z.string(),
  batchId: z.string(),
  timestamp: z.string(),
  repoCommit: z.string(),
  agent: AgentIdSchema,
  model: z.string(),
  effort: z.string(),
  mode: ModeSchema,
  taskId: TaskIdSchema,
  category: TaskCategorySchema,
  command: z.string(),
  workspacePath: z.string(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  tokenUsage: TokenUsageSchema,
  status: z.enum(["passed", "failed", "skipped", "error"]),
  scores: ScoreSchema,
  artifacts: ArtifactUrlsSchema,
  errors: z.array(StructuredErrorSchema),
  skillName: z.string().nullable(),
  skillPath: z.string().nullable(),
  skillSha256: z.string().nullable(),
  activation: z.literal("prompt-injected"),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const TaskSpecSchema = z.object({
  id: TaskIdSchema,
  title: z.string(),
  category: TaskCategorySchema,
  topic: z.string(),
  prompt: z.string(),
  successCriteria: z.array(z.string()),
  fixturePath: z.string().nullable().default(null),
  validators: z.array(z.string()).default([]),
});
export type TaskSpec = z.infer<typeof TaskSpecSchema>;

export const BatchSummarySchema = z.object({
  batchId: z.string(),
  timestamp: z.string(),
  runCount: z.number().int().nonnegative(),
  agents: z.array(AgentIdSchema),
  modes: z.array(ModeSchema),
  tasks: z.array(TaskIdSchema),
});
export type BatchSummary = z.infer<typeof BatchSummarySchema>;

export const ScoreboardRowSchema = z.object({
  agent: AgentIdSchema,
  mode: ModeSchema,
  runCount: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  total: z.number().min(0).max(100),
});
export type ScoreboardRow = z.infer<typeof ScoreboardRowSchema>;

export const ResultIndexSchema = z.object({
  generatedAt: z.string(),
  batches: z.array(BatchSummarySchema),
  scoreboards: z.array(ScoreboardRowSchema),
  tasks: z.array(TaskSpecSchema),
  runs: z.array(RunResultSchema),
});
export type ResultIndex = z.infer<typeof ResultIndexSchema>;

