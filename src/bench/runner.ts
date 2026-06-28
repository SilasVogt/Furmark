import path from "node:path";
import { promises as fs } from "node:fs";
import { buildAgentCommand } from "./adapters";
import { AGENTS, MODES, TASKS } from "./constants";
import { ensureDir, writeJson, writeText } from "./files";
import { writeResultIndex } from "./indexer";
import { assemblePrompt } from "./prompts";
import { parseAgentOutput } from "./result-parser";
import { RunResultSchema, type AgentId, type Mode, type RunResult, type TaskId, type TaskSpec } from "./schema";
import { scoreRun, withSkillUplifts } from "./scoring";
import { loadSkillForMode } from "./skills";
import { loadTaskSpecs } from "./tasks";
import { collectWorkspaceDiff, prepareWorkspace } from "./workspace";
import { runProcess } from "./process";
import { verifyBrowserWorkspace } from "./browser-verify";
import { isBrowserTask } from "./tasks";

export type RunSelection = {
  matrix?: "full";
  agent?: AgentId;
  mode?: Mode;
  task?: TaskId;
  batchId?: string;
  dryRun?: boolean;
  resume?: boolean;
  force?: boolean;
  maxRuns?: number;
  stopOnError?: boolean;
  installDependencies?: boolean;
  timeoutMs?: number;
};

type CaseSpec = {
  agent: AgentId;
  mode: Mode;
  task: TaskSpec;
};

type CaseState = {
  runId: string;
  agent: AgentId;
  mode: Mode;
  taskId: TaskId;
  status: "pending" | "running" | "reused" | "passed" | "failed" | "skipped" | "error";
  previousStatus?: RunResult["status"];
  startedAt?: string;
  completedAt?: string;
};

type BatchRunState = {
  batchId: string;
  status: "running" | "paused" | "complete" | "error";
  timestamp: string;
  updatedAt: string;
  resume: boolean;
  force: boolean;
  maxRuns: number | null;
  stopOnError: boolean;
  totalCases: number;
  executedRuns: number;
  reusedRuns: number;
  completedRuns: number;
  pendingRuns: number;
  failedRuns: number;
  nextRunId: string | null;
  pauseReason: string | null;
  cases: CaseState[];
};

export async function runBenchmark(selection: RunSelection, repoRoot = process.cwd()): Promise<RunResult[]> {
  const tasks = await loadTaskSpecs(repoRoot);
  const cases = selectCases(selection, tasks);
  const batchId = selection.batchId ?? (selection.dryRun ? "dry-run-seed" : makeBatchId());
  const timestamp = selection.dryRun ? "2026-01-01T00:00:00.000Z" : new Date().toISOString();
  const repoCommit = await currentRepoCommit(repoRoot);
  const resume = selection.resume ?? !selection.dryRun;
  const force = selection.force ?? false;
  const stopOnError = selection.stopOnError ?? !selection.dryRun;
  const maxRuns = selection.maxRuns ?? null;
  const logProgress = !selection.dryRun || maxRuns !== null || selection.resume === true;
  const batchRunsById = await loadExistingBatchRuns(repoRoot, batchId);
  const selectedRuns: RunResult[] = [];
  const caseStates: CaseState[] = cases.map((caseSpec) => {
    const runId = makeRunId(batchId, caseSpec.agent, caseSpec.mode, caseSpec.task.id);
    const existing = batchRunsById.get(runId);
    return {
      runId,
      agent: caseSpec.agent,
      mode: caseSpec.mode,
      taskId: caseSpec.task.id,
      status: "pending",
      previousStatus: existing?.status,
    };
  });
  const stateContext = {
    repoRoot,
    batchId,
    timestamp,
    resume,
    force,
    maxRuns,
    stopOnError,
    cases: caseStates,
    executedRuns: 0,
    reusedRuns: 0,
    pauseReason: null as string | null,
  };

  await writeBatchState({ ...stateContext, status: "running" });

  for (const caseSpec of cases) {
    const runId = makeRunId(batchId, caseSpec.agent, caseSpec.mode, caseSpec.task.id);
    const caseState = caseStates.find((candidate) => candidate.runId === runId);
    if (!caseState) throw new Error(`Missing state for ${runId}`);

    const existing = batchRunsById.get(runId);
    if (existing && resume && !force && canReuseExistingRun(existing)) {
      caseState.status = "reused";
      caseState.completedAt = new Date().toISOString();
      stateContext.reusedRuns += 1;
      selectedRuns.push(existing);
      await writeBatchState({ ...stateContext, status: "running" });
      if (logProgress) console.log(`[resume] reused ${existing.agent}/${existing.mode}/${existing.taskId} (${existing.status})`);
      continue;
    }

    if (maxRuns !== null && stateContext.executedRuns >= maxRuns) {
      stateContext.pauseReason = `Reached --max-runs ${maxRuns}.`;
      await writeBatchState({ ...stateContext, status: "paused" });
      if (logProgress) console.log(`[pause] ${stateContext.pauseReason}`);
      break;
    }

    caseState.status = "running";
    caseState.startedAt = new Date().toISOString();
    await writeBatchState({ ...stateContext, status: "running" });
    if (logProgress) console.log(`[run] ${caseSpec.agent}/${caseSpec.mode}/${caseSpec.task.id}`);

    const run = await runOneCase({
      selection,
      repoRoot,
      batchId,
      timestamp,
      repoCommit,
      caseSpec,
    });
    stateContext.executedRuns += 1;
    caseState.status = run.status;
    caseState.completedAt = new Date().toISOString();
    batchRunsById.set(run.runId, run);
    selectedRuns.push(run);
    await writeRunJson(repoRoot, run);
    await writeBatchState({ ...stateContext, status: "running" });

    if (stopOnError && (run.status === "failed" || run.status === "error")) {
      stateContext.pauseReason = `${run.agent}/${run.mode}/${run.taskId} ended with ${run.status}. Resume will retry this case unless --force or --no-resume changes the plan.`;
      await writeBatchState({ ...stateContext, status: "paused" });
      if (logProgress) console.log(`[pause] ${stateContext.pauseReason}`);
      break;
    }
  }

  const allBatchRuns = [...batchRunsById.values()];
  withSkillUplifts(allBatchRuns);
  await Promise.all(allBatchRuns.map((run) => writeRunJson(repoRoot, run)));
  await writeResultIndex({ repoRoot, batchId, timestamp, tasks, runs: allBatchRuns });
  await writeBatchState({
    ...stateContext,
    status: stateContext.pauseReason ? "paused" : "complete",
  });
  return selectedRuns;
}

export function selectCases(selection: RunSelection, tasks: TaskSpec[]): CaseSpec[] {
  const agents = selection.matrix === "full" || !selection.agent ? [...AGENTS] : [selection.agent];
  const modes = selection.matrix === "full" || !selection.mode ? [...MODES] : [selection.mode];
  const taskIds = selection.matrix === "full" || !selection.task ? [...TASKS] : [selection.task];
  return agents.flatMap((agent) =>
    modes.flatMap((mode) =>
      taskIds.map((taskId) => {
        const task = tasks.find((candidate) => candidate.id === taskId);
        if (!task) throw new Error(`Unknown task: ${taskId}`);
        return { agent, mode, task };
      }),
    ),
  );
}

async function runOneCase(input: {
  selection: RunSelection;
  repoRoot: string;
  batchId: string;
  timestamp: string;
  repoCommit: string;
  caseSpec: CaseSpec;
}): Promise<RunResult> {
  try {
    return input.selection.dryRun
      ? await createDryRun({ repoRoot: input.repoRoot, batchId: input.batchId, timestamp: input.timestamp, repoCommit: input.repoCommit, ...input.caseSpec })
      : await runRealCase({
          repoRoot: input.repoRoot,
          batchId: input.batchId,
          timestamp: input.timestamp,
          repoCommit: input.repoCommit,
          caseSpec: input.caseSpec,
          installDependencies: input.selection.installDependencies ?? true,
          timeoutMs: input.selection.timeoutMs ?? 3_600_000,
        });
  } catch (error) {
    return createErrorRun({
      repoRoot: input.repoRoot,
      batchId: input.batchId,
      timestamp: input.timestamp,
      repoCommit: input.repoCommit,
      caseSpec: input.caseSpec,
      error,
    });
  }
}

async function runRealCase(input: {
  repoRoot: string;
  batchId: string;
  timestamp: string;
  repoCommit: string;
  caseSpec: CaseSpec;
  installDependencies: boolean;
  timeoutMs: number;
}): Promise<RunResult> {
  const { agent, mode, task } = input.caseSpec;
  const runId = makeRunId(input.batchId, agent, mode, task.id);
  const rawDir = path.join(input.repoRoot, "results", "raw", input.batchId, runId);
  const publicDir = path.join(input.repoRoot, "public", "results", "batches", input.batchId, runId);
  const workspacePath = path.join(rawDir, "workspace");
  await ensureDir(publicDir);

  const skill = await loadSkillForMode(mode, input.repoRoot);
  const command = buildAgentCommand(agent, workspacePath);
  if (skill.setupError) {
    return writeSkippedRun({ input, runId, workspacePath, command, publicDir, error: skill.setupError, skill });
  }

  const setup = await prepareWorkspace({
    repoRoot: input.repoRoot,
    task,
    workspacePath,
    installDependencies: input.installDependencies,
  });
  const prompt = assemblePrompt({ task, skill });
  await writeText(path.join(rawDir, "prompt.md"), prompt);

  const result = await runProcess(command.bin, command.args, {
    cwd: command.cwd,
    input: prompt,
    timeoutMs: input.timeoutMs,
  });
  const verification = await verifyWorkspaceCommands(workspacePath);
  const parsed = parseAgentOutput(result.stdout);
  const diffText = await collectWorkspaceDiff(workspacePath);
  const screenshotNames: string[] = [];
  const metrics = {
    testPassRate: verification.testExitCode === null ? (result.exitCode === 0 ? 1 : 0) : verification.testExitCode === 0 ? 1 : 0,
    typecheck: verification.buildExitCode === null ? undefined : verification.buildExitCode === 0,
    setup,
  };
  let browserMetrics: Record<string, unknown> = {};
  let siteUrl: string | undefined;
  if (isBrowserTask(task)) {
    const screenshotDir = path.join(publicDir, "screenshots");
    await ensureDir(screenshotDir);
    try {
      browserMetrics = await verifyBrowserWorkspace({ workspacePath, task, screenshotDir });
      screenshotNames.push("desktop.png", "mobile.png");
    } catch (error) {
      browserMetrics = {
        browserVerificationError: error instanceof Error ? error.message : String(error),
      };
    }
    siteUrl = await publishSiteArtifact({ workspacePath, publicDir, batchId: input.batchId, runId });
  }
  const combinedMetrics = { ...metrics, ...browserMetrics };

  const artifacts = await writeArtifacts({
    rawDir,
    publicDir,
    batchId: input.batchId,
    runId,
    stdout: result.stdout,
    stderr: result.stderr,
    finalText: parsed.finalMessage,
    diffText,
    metrics: combinedMetrics,
    verificationText: verification.output,
    events: parsed.events,
    screenshots: screenshotNames,
    site: siteUrl,
  });
  const scores = scoreRun({
    task,
    exitCode: result.exitCode,
    finalText: parsed.finalMessage,
    diffText,
    metrics: combinedMetrics,
    screenshotCount: artifacts.screenshots.length,
  });

  return RunResultSchema.parse({
    runId,
    batchId: input.batchId,
    timestamp: input.timestamp,
    repoCommit: input.repoCommit,
    agent,
    model: command.model,
    effort: command.effort,
    mode,
    taskId: task.id,
    category: task.category,
    command: command.command,
    workspacePath,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    costUsd: parsed.costUsd,
    tokenUsage: parsed.tokenUsage,
    status: result.exitCode === 0 ? "passed" : "failed",
    scores,
    artifacts,
    errors: [],
    skillName: skill.skillName,
    skillPath: skill.skillPath,
    skillSha256: skill.skillSha256,
    activation: "prompt-injected",
  });
}

async function createDryRun(input: {
  repoRoot: string;
  batchId: string;
  timestamp: string;
  repoCommit: string;
  agent: AgentId;
  mode: Mode;
  task: TaskSpec;
}): Promise<RunResult> {
  const runId = makeRunId(input.batchId, input.agent, input.mode, input.task.id);
  const rawDir = path.join(input.repoRoot, "results", "raw", input.batchId, runId);
  const publicDir = path.join(input.repoRoot, "public", "results", "batches", input.batchId, runId);
  const workspacePath = path.join(rawDir, "workspace");
  await ensureDir(workspacePath);
  await ensureDir(publicDir);
  const skill = await loadSkillForMode(input.mode, input.repoRoot);
  const command = buildAgentCommand(input.agent, workspacePath);
  const skipped = Boolean(skill.setupError);
  const diffText = skipped ? "" : fakeDiff(input.task.id);
  const finalText = skipped ? skill.setupError!.message : `Dry run completed for ${input.task.id}. Verification was simulated.`;
  const metrics = skipped
    ? { setupError: skill.setupError }
    : fakeMetrics(input.task.category, input.agent, input.mode, input.task.id);
  const screenshots = input.task.category === "pure-coding" || skipped ? [] : ["desktop.png", "mobile.png"];
  const artifacts = await writeArtifacts({
    rawDir,
    publicDir,
    batchId: input.batchId,
    runId,
    stdout: JSON.stringify({ final: finalText, usage: { total_tokens: dryTokenCount(input.agent, input.mode) } }, null, 2),
    stderr: skipped ? skill.setupError!.message : "",
    finalText,
    diffText,
    metrics,
    verificationText: skipped ? skill.setupError!.message : "Dry-run verification simulated successfully.\n",
    events: [{ type: "dry-run", taskId: input.task.id, mode: input.mode, agent: input.agent }],
    screenshots,
  });
  const scores = scoreRun({
    task: input.task,
    exitCode: skipped ? null : 0,
    finalText,
    diffText,
    metrics,
    screenshotCount: artifacts.screenshots.length,
    setupSkipped: skipped,
  });

  return RunResultSchema.parse({
    runId,
    batchId: input.batchId,
    timestamp: input.timestamp,
    repoCommit: input.repoCommit,
    agent: input.agent,
    model: command.model,
    effort: command.effort,
    mode: input.mode,
    taskId: input.task.id,
    category: input.task.category,
    command: command.command,
    workspacePath,
    exitCode: skipped ? null : 0,
    durationMs: dryDuration(input.agent, input.mode, input.task.id),
    costUsd: skipped ? null : 0,
    tokenUsage: skipped ? null : { totalTokens: dryTokenCount(input.agent, input.mode) },
    status: skipped ? "skipped" : "passed",
    scores,
    artifacts,
    errors: skipped && skill.setupError ? [skill.setupError] : [],
    skillName: skill.skillName,
    skillPath: skill.skillPath,
    skillSha256: skill.skillSha256,
    activation: "prompt-injected",
  });
}

async function writeSkippedRun(input: {
  input: {
    batchId: string;
    timestamp: string;
    repoCommit: string;
    caseSpec: CaseSpec;
  };
  runId: string;
  workspacePath: string;
  command: ReturnType<typeof buildAgentCommand>;
  publicDir: string;
  error: { code: string; message: string; detail?: string };
  skill: Awaited<ReturnType<typeof loadSkillForMode>>;
}): Promise<RunResult> {
  const { agent, mode, task } = input.input.caseSpec;
  const artifacts = await writeArtifacts({
    rawDir: path.dirname(input.workspacePath),
    publicDir: input.publicDir,
    batchId: input.input.batchId,
    runId: input.runId,
    stdout: "",
    stderr: input.error.message,
    finalText: input.error.message,
    diffText: "",
    metrics: { setupError: input.error },
    verificationText: input.error.message,
    events: [{ type: "skipped", error: input.error }],
    screenshots: [],
  });
  return RunResultSchema.parse({
    runId: input.runId,
    batchId: input.input.batchId,
    timestamp: input.input.timestamp,
    repoCommit: input.input.repoCommit,
    agent,
    model: input.command.model,
    effort: input.command.effort,
    mode,
    taskId: task.id,
    category: task.category,
    command: input.command.command,
    workspacePath: input.workspacePath,
    exitCode: null,
    durationMs: 0,
    costUsd: null,
    tokenUsage: null,
    status: "skipped",
    scores: scoreRun({
      task,
      exitCode: null,
      finalText: input.error.message,
      diffText: "",
      metrics: {},
      screenshotCount: 0,
      setupSkipped: true,
    }),
    artifacts,
    errors: [input.error],
    skillName: input.skill.skillName,
    skillPath: input.skill.skillPath,
    skillSha256: input.skill.skillSha256,
    activation: "prompt-injected",
  });
}

async function createErrorRun(input: {
  repoRoot: string;
  batchId: string;
  timestamp: string;
  repoCommit: string;
  caseSpec: CaseSpec;
  error: unknown;
}): Promise<RunResult> {
  const { agent, mode, task } = input.caseSpec;
  const runId = makeRunId(input.batchId, agent, mode, task.id);
  const rawDir = path.join(input.repoRoot, "results", "raw", input.batchId, runId);
  const publicDir = path.join(input.repoRoot, "public", "results", "batches", input.batchId, runId);
  const workspacePath = path.join(rawDir, "workspace");
  const skill = await loadSkillForMode(mode, input.repoRoot);
  const command = buildAgentCommand(agent, workspacePath);
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const artifacts = await writeArtifacts({
    rawDir,
    publicDir,
    batchId: input.batchId,
    runId,
    stdout: "",
    stderr: message,
    finalText: message,
    diffText: "",
    metrics: { harnessError: message },
    verificationText: message,
    events: [{ type: "error", message }],
    screenshots: [],
  });

  return RunResultSchema.parse({
    runId,
    batchId: input.batchId,
    timestamp: input.timestamp,
    repoCommit: input.repoCommit,
    agent,
    model: command.model,
    effort: command.effort,
    mode,
    taskId: task.id,
    category: task.category,
    command: command.command,
    workspacePath,
    exitCode: null,
    durationMs: 0,
    costUsd: null,
    tokenUsage: null,
    status: "error",
    scores: scoreRun({
      task,
      exitCode: null,
      finalText: message,
      diffText: "",
      metrics: {},
      screenshotCount: 0,
      setupSkipped: true,
    }),
    artifacts,
    errors: [{ code: "harness_error", message }],
    skillName: skill.skillName,
    skillPath: skill.skillPath,
    skillSha256: skill.skillSha256,
    activation: "prompt-injected",
  });
}

async function writeArtifacts(input: {
  rawDir: string;
  publicDir: string;
  batchId: string;
  runId: string;
  stdout: string;
  stderr: string;
  finalText: string;
  diffText: string;
  metrics: Record<string, unknown>;
  verificationText: string;
  events: unknown[];
  screenshots: string[];
  site?: string;
}): Promise<RunResult["artifacts"]> {
  await ensureDir(input.rawDir);
  await ensureDir(input.publicDir);
  await writeText(path.join(input.rawDir, "stdout.txt"), input.stdout);
  await writeText(path.join(input.rawDir, "stderr.txt"), input.stderr);
  await writeText(path.join(input.rawDir, "final.txt"), input.finalText);
  await writeText(path.join(input.rawDir, "diff.patch"), input.diffText);
  await writeText(path.join(input.rawDir, "verification.txt"), input.verificationText);
  await writeJson(path.join(input.rawDir, "metrics.json"), input.metrics);
  await writeText(path.join(input.rawDir, "events.jsonl"), input.events.map((event) => JSON.stringify(event)).join("\n"));

  await writeText(path.join(input.publicDir, "stdout.txt"), input.stdout);
  await writeText(path.join(input.publicDir, "stderr.txt"), input.stderr);
  await writeText(path.join(input.publicDir, "final.txt"), input.finalText);
  await writeText(path.join(input.publicDir, "diff.patch"), input.diffText);
  await writeText(path.join(input.publicDir, "verification.txt"), input.verificationText);
  await writeJson(path.join(input.publicDir, "metrics.json"), input.metrics);
  await writeText(path.join(input.publicDir, "events.jsonl"), input.events.map((event) => JSON.stringify(event)).join("\n"));
  const screenshotUrls: string[] = [];
  for (const screenshot of input.screenshots) {
    const filePath = path.join(input.publicDir, "screenshots", screenshot);
    try {
      await fs.access(filePath);
    } catch {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, placeholderPngBuffer());
    }
    screenshotUrls.push(`results/batches/${input.batchId}/${input.runId}/screenshots/${screenshot}`);
  }

  return {
    stdout: `results/batches/${input.batchId}/${input.runId}/stdout.txt`,
    stderr: `results/batches/${input.batchId}/${input.runId}/stderr.txt`,
    final: `results/batches/${input.batchId}/${input.runId}/final.txt`,
    events: `results/batches/${input.batchId}/${input.runId}/events.jsonl`,
    diff: `results/batches/${input.batchId}/${input.runId}/diff.patch`,
    metrics: `results/batches/${input.batchId}/${input.runId}/metrics.json`,
    verification: `results/batches/${input.batchId}/${input.runId}/verification.txt`,
    site: input.site,
    screenshots: screenshotUrls,
  };
}

async function publishSiteArtifact(input: {
  workspacePath: string;
  publicDir: string;
  batchId: string;
  runId: string;
}): Promise<string | undefined> {
  const distDir = path.join(input.workspacePath, "dist");
  const siteDir = path.join(input.publicDir, "site");
  const indexPath = path.join(siteDir, "index.html");
  try {
    await fs.access(path.join(distDir, "index.html"));
    await fs.rm(siteDir, { recursive: true, force: true });
    await fs.cp(distDir, siteDir, { recursive: true });
    await rewriteNestedSiteIndex(indexPath);
    return `results/batches/${input.batchId}/${input.runId}/site/index.html`;
  } catch {
    return undefined;
  }
}

async function rewriteNestedSiteIndex(indexPath: string): Promise<void> {
  const html = await fs.readFile(indexPath, "utf8");
  const rewritten = html.replace(/\b(src|href)=(["'])\/assets\//g, "$1=$2./assets/");
  if (rewritten !== html) await writeText(indexPath, rewritten);
}

async function verifyWorkspaceCommands(workspacePath: string): Promise<{
  testExitCode: number | null;
  buildExitCode: number | null;
  output: string;
}> {
  const packageJson = path.join(workspacePath, "package.json");
  try {
    await fs.access(packageJson);
  } catch {
    return {
      testExitCode: null,
      buildExitCode: null,
      output: "No package.json found. Verification skipped.\n",
    };
  }

  const test = await runProcess("pnpm", ["test"], { cwd: workspacePath, timeoutMs: 180_000 });
  const build = await runProcess("pnpm", ["build"], { cwd: workspacePath, timeoutMs: 180_000 });
  return {
    testExitCode: test.exitCode,
    buildExitCode: build.exitCode,
    output: [
      "$ pnpm test",
      test.stdout,
      test.stderr,
      `exit ${test.exitCode}`,
      "",
      "$ pnpm build",
      build.stdout,
      build.stderr,
      `exit ${build.exitCode}`,
      "",
    ].join("\n"),
  };
}

async function writeRunJson(repoRoot: string, run: RunResult): Promise<void> {
  await writeJson(path.join(repoRoot, "public", "results", "batches", run.batchId, run.runId, "run.json"), run);
}

async function loadExistingBatchRuns(repoRoot: string, batchId: string): Promise<Map<string, RunResult>> {
  const batchDir = path.join(repoRoot, "public", "results", "batches", batchId);
  const runs = new Map<string, RunResult>();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(batchDir);
  } catch {
    return runs;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const runJsonPath = path.join(batchDir, entry, "run.json");
      try {
        const raw = await fs.readFile(runJsonPath, "utf8");
        const run = RunResultSchema.parse(JSON.parse(raw));
        runs.set(run.runId, run);
      } catch {
        // Ignore partial artifacts. They will be regenerated on resume.
      }
    }),
  );
  return runs;
}

function canReuseExistingRun(run: RunResult): boolean {
  return run.status === "passed" || run.status === "skipped";
}

async function writeBatchState(input: {
  repoRoot: string;
  batchId: string;
  timestamp: string;
  resume: boolean;
  force: boolean;
  maxRuns: number | null;
  stopOnError: boolean;
  status: BatchRunState["status"];
  cases: CaseState[];
  executedRuns: number;
  reusedRuns: number;
  pauseReason: string | null;
}): Promise<void> {
  const completedStatuses = new Set(["reused", "passed", "skipped"]);
  const failedStatuses = new Set(["failed", "error"]);
  const pending = input.cases.find((caseState) => caseState.status === "pending" || failedStatuses.has(caseState.status));
  const state: BatchRunState = {
    batchId: input.batchId,
    status: input.status,
    timestamp: input.timestamp,
    updatedAt: new Date().toISOString(),
    resume: input.resume,
    force: input.force,
    maxRuns: input.maxRuns,
    stopOnError: input.stopOnError,
    totalCases: input.cases.length,
    executedRuns: input.executedRuns,
    reusedRuns: input.reusedRuns,
    completedRuns: input.cases.filter((caseState) => completedStatuses.has(caseState.status)).length,
    pendingRuns: input.cases.filter((caseState) => caseState.status === "pending").length,
    failedRuns: input.cases.filter((caseState) => failedStatuses.has(caseState.status)).length,
    nextRunId: pending?.runId ?? null,
    pauseReason: input.pauseReason,
    cases: input.cases,
  };
  await writeJson(path.join(input.repoRoot, "results", "raw", input.batchId, "state.json"), state);
}

async function currentRepoCommit(repoRoot: string): Promise<string> {
  const result = await runProcess("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot });
  return result.exitCode === 0 ? result.stdout.trim() : "uncommitted";
}

function makeBatchId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeRunId(batchId: string, agent: AgentId, mode: Mode, taskId: string): string {
  return `${batchId}__${agent}__${mode}__${taskId}`;
}

function dryTokenCount(agent: AgentId, mode: Mode): number {
  return 15_000 + agent.length * 100 + mode.length * 50;
}

function dryDuration(agent: AgentId, mode: Mode, taskId: string): number {
  return 30_000 + agent.length * 800 + mode.length * 500 + taskId.length * 250;
}

function fakeMetrics(category: TaskSpec["category"], agent: AgentId, mode: Mode, taskId: string): Record<string, unknown> {
  const base = 0.72 + (agent === "codex" ? 0.06 : agent === "claude-code" ? 0.04 : 0.02) + (mode === "furry" ? 0.03 : 0);
  return {
    testPassRate: Math.min(1, Number(base.toFixed(2))),
    typecheck: true,
    runtimeErrors: false,
    nonblankPixels: category !== "pure-coding",
    responsiveRender: category !== "pure-coding",
    consoleErrors: 0,
    frameDifference: category === "browser-animation" ? 0.12 + taskId.length / 1000 : undefined,
    pauseBehavior: category === "browser-animation",
    reducedMotion: category === "browser-animation",
  };
}

function fakeDiff(taskId: string): string {
  return `diff --git a/src/${taskId}.ts b/src/${taskId}.ts\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/src/${taskId}.ts\n@@ -0,0 +1,3 @@\n+export const taskId = "${taskId}";\n+export const status = "dry-run";\n+export const verified = true;\n`;
}

function placeholderPngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}
