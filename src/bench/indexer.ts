import path from "node:path";
import { promises as fs } from "node:fs";
import { AGENTS, MODES } from "./constants";
import { writeJson } from "./files";
import { ResultIndexSchema, type ResultIndex, type RunResult, type ScoreboardRow, type TaskSpec } from "./schema";

export async function writeResultIndex(input: {
  repoRoot: string;
  batchId: string;
  timestamp: string;
  tasks: TaskSpec[];
  runs: RunResult[];
}): Promise<ResultIndex> {
  const indexPath = path.join(input.repoRoot, "public", "results", "index.json");
  const previous = await readExistingIndex(indexPath);
  const runsById = new Map<string, RunResult>();
  for (const run of previous?.runs ?? []) runsById.set(run.runId, run);
  for (const run of input.runs) runsById.set(run.runId, run);

  const runs = [...runsById.values()].sort((a, b) => a.runId.localeCompare(b.runId));
  const batchIds = new Set(runs.map((run) => run.batchId));
  const batches = [...batchIds].sort().map((batchId) => {
    const batchRuns = runs.filter((run) => run.batchId === batchId);
    return {
      batchId,
      timestamp: batchRuns[0]?.timestamp ?? input.timestamp,
      runCount: batchRuns.length,
      agents: unique(batchRuns.map((run) => run.agent)),
      modes: unique(batchRuns.map((run) => run.mode)),
      tasks: unique(batchRuns.map((run) => run.taskId)),
    };
  });

  const index: ResultIndex = {
    generatedAt: input.timestamp,
    batches,
    scoreboards: buildScoreboard(runs),
    tasks: input.tasks,
    runs,
  };

  await writeJson(indexPath, ResultIndexSchema.parse(index));
  return index;
}

export async function readResultIndex(repoRoot = process.cwd()): Promise<ResultIndex> {
  const filePath = path.join(repoRoot, "public", "results", "index.json");
  const raw = await fs.readFile(filePath, "utf8");
  return ResultIndexSchema.parse(JSON.parse(raw));
}

function buildScoreboard(runs: RunResult[]): ScoreboardRow[] {
  const rows: ScoreboardRow[] = [];
  for (const agent of AGENTS) {
    for (const mode of MODES) {
      const group = runs.filter((run) => run.agent === agent && run.mode === mode);
      if (group.length === 0) continue;
      rows.push({
        agent,
        mode,
        runCount: group.length,
        passed: group.filter((run) => run.status === "passed").length,
        failed: group.filter((run) => run.status === "failed" || run.status === "error").length,
        skipped: group.filter((run) => run.status === "skipped").length,
        total: Math.round((group.reduce((sum, run) => sum + run.scores.total, 0) / group.length) * 10) / 10,
      });
    }
  }
  return rows;
}

async function readExistingIndex(indexPath: string): Promise<ResultIndex | null> {
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    return ResultIndexSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

