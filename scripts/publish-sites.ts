import { promises as fs } from "node:fs";
import path from "node:path";
import { parseRunSelection } from "../src/bench/cli";
import { readResultIndex, writeResultIndex } from "../src/bench/indexer";
import { writeJson, writeText } from "../src/bench/files";

const selection = parseRunSelection(process.argv.slice(2));
if (!selection.batchId) throw new Error("Usage: pnpm bench:sites --batch <batchId>");

const repoRoot = process.cwd();
const index = await readResultIndex(repoRoot);
const runs = index.runs.filter((run) => run.batchId === selection.batchId && run.category !== "pure-coding");
let published = 0;
let missing = 0;

for (const run of runs) {
  const rawDistDir = path.join(repoRoot, "results", "raw", run.batchId, run.runId, "workspace", "dist");
  const publicRunDir = path.join(repoRoot, "public", "results", "batches", run.batchId, run.runId);
  const publicSiteDir = path.join(publicRunDir, "site");
  try {
    await fs.access(path.join(rawDistDir, "index.html"));
    await fs.rm(publicSiteDir, { recursive: true, force: true });
    await fs.cp(rawDistDir, publicSiteDir, { recursive: true });
    await rewriteNestedSiteIndex(path.join(publicSiteDir, "index.html"));
    run.artifacts.site = `results/batches/${run.batchId}/${run.runId}/site/index.html`;
    await writeJson(path.join(publicRunDir, "run.json"), run);
    published += 1;
  } catch {
    missing += 1;
  }
}

await writeResultIndex({
  repoRoot,
  batchId: selection.batchId,
  timestamp: new Date().toISOString(),
  tasks: index.tasks,
  runs: index.runs.filter((run) => run.batchId === selection.batchId),
});

console.log(`published ${published} browser sites for ${selection.batchId}`);
if (missing > 0) console.log(`missing dist for ${missing} browser runs`);

async function rewriteNestedSiteIndex(indexPath: string): Promise<void> {
  const html = await fs.readFile(indexPath, "utf8");
  const rewritten = html.replace(/\b(src|href)=(["'])\/assets\//g, "$1=$2./assets/");
  if (rewritten !== html) await writeText(indexPath, rewritten);
}
