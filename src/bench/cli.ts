import { normalizeAgent } from "./adapters";
import { ModeSchema, TaskIdSchema, type Mode, type TaskId } from "./schema";
import type { RunSelection } from "./runner";

export function parseRunSelection(argv: string[]): RunSelection {
  const selection: RunSelection = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--matrix") {
      if (next !== "full") throw new Error("Only --matrix full is supported.");
      selection.matrix = "full";
      index += 1;
    } else if (arg === "--agent") {
      if (!next) throw new Error("--agent requires a value.");
      selection.agent = normalizeAgent(next);
      index += 1;
    } else if (arg === "--mode") {
      if (!next) throw new Error("--mode requires a value.");
      selection.mode = ModeSchema.parse(next) as Mode;
      index += 1;
    } else if (arg === "--task") {
      if (!next) throw new Error("--task requires a value.");
      selection.task = TaskIdSchema.parse(next) as TaskId;
      index += 1;
    } else if (arg === "--batch" || arg === "--batchId") {
      if (!next) throw new Error(`${arg} requires a value.`);
      selection.batchId = next;
      index += 1;
    } else if (arg === "--no-install") {
      selection.installDependencies = false;
    } else if (arg === "--resume") {
      selection.resume = true;
    } else if (arg === "--no-resume") {
      selection.resume = false;
    } else if (arg === "--force") {
      selection.force = true;
    } else if (arg === "--continue-on-error") {
      selection.stopOnError = false;
    } else if (arg === "--max-runs") {
      if (!next) throw new Error("--max-runs requires a value.");
      selection.maxRuns = Number(next);
      if (!Number.isInteger(selection.maxRuns) || selection.maxRuns < 1) throw new Error("--max-runs must be a positive integer.");
      index += 1;
    } else if (arg === "--timeout-ms") {
      if (!next) throw new Error("--timeout-ms requires a value.");
      selection.timeoutMs = Number(next);
      if (!Number.isFinite(selection.timeoutMs) || selection.timeoutMs < 1) throw new Error("--timeout-ms must be a positive number.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return selection;
}

export function printRunSummary(runs: { status: string; agent: string; mode: string; taskId: string; scores: { total: number } }[]): void {
  const passed = runs.filter((run) => run.status === "passed").length;
  const skipped = runs.filter((run) => run.status === "skipped").length;
  const failed = runs.length - passed - skipped;
  console.log(`runs=${runs.length} passed=${passed} failed=${failed} skipped=${skipped}`);
  for (const run of runs.slice(0, 8)) {
    console.log(`${run.agent}/${run.mode}/${run.taskId}: ${run.status} ${run.scores.total}`);
  }
  if (runs.length > 8) console.log(`... ${runs.length - 8} more`);
}
