import { promises as fs } from "node:fs";
import path from "node:path";
import { parseRunSelection } from "../src/bench/cli";
import { readResultIndex, writeResultIndex } from "../src/bench/indexer";
import { loadTaskSpecs } from "../src/bench/tasks";
import { scoreRun, withSkillUplifts } from "../src/bench/scoring";

const selection = parseRunSelection(process.argv.slice(2));
if (!selection.batchId) throw new Error("Usage: pnpm bench:score --batch <batchId>");

const repoRoot = process.cwd();
const index = await readResultIndex(repoRoot);
const tasks = await loadTaskSpecs(repoRoot);
const runs = index.runs.filter((run) => run.batchId === selection.batchId);
if (runs.length === 0) throw new Error(`No runs found for batch ${selection.batchId}`);

for (const run of runs) {
  const task = tasks.find((candidate) => candidate.id === run.taskId);
  if (!task) throw new Error(`Task missing for ${run.taskId}`);
  const diffPath = run.artifacts.diff ? path.join(repoRoot, "public", run.artifacts.diff) : null;
  const finalPath = run.artifacts.final ? path.join(repoRoot, "public", run.artifacts.final) : null;
  const metricsPath = run.artifacts.metrics ? path.join(repoRoot, "public", run.artifacts.metrics) : null;
  const diffText = diffPath ? await fs.readFile(diffPath, "utf8") : "";
  const finalText = finalPath ? await fs.readFile(finalPath, "utf8") : "";
  const metrics = metricsPath ? JSON.parse(await fs.readFile(metricsPath, "utf8")) : {};
  run.scores = scoreRun({
    task,
    exitCode: run.exitCode,
    finalText,
    diffText,
    metrics,
    screenshotCount: run.artifacts.screenshots.length,
    setupSkipped: run.status === "skipped",
  });
}

withSkillUplifts(runs);
await writeResultIndex({
  repoRoot,
  batchId: selection.batchId,
  timestamp: new Date().toISOString(),
  tasks,
  runs,
});
console.log(`rescored ${runs.length} runs for batch ${selection.batchId}`);

