import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentCommand } from "../src/bench/adapters";
import { parseAgentOutput } from "../src/bench/result-parser";
import { runBenchmark, selectCases } from "../src/bench/runner";
import { scoreRun } from "../src/bench/scoring";
import { loadSkillForMode } from "../src/bench/skills";
import { assemblePrompt } from "../src/bench/prompts";
import { loadTaskSpec, loadTaskSpecs } from "../src/bench/tasks";

describe("benchmark harness", () => {
  it("assembles prompt-injected skill instructions", async () => {
    const task = await loadTaskSpec("coding-cache");
    const skill = await loadSkillForMode("furry");
    const prompt = assemblePrompt({ task, skill });
    expect(prompt).toContain("Prompt-Injected Skill Instructions");
    expect(prompt).toContain("Furry SFW Benchmark Skill");
    expect(prompt).toContain("typed LRU cache");
  });

  it("marks missing ponytail skill as a setup error", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "furmark-skill-"));
    const skill = await loadSkillForMode("ponytail", root);
    expect(skill.setupError?.code).toBe("skill_missing");
    expect(skill.skillPath).toBe("skills/ponytail/SKILL.md");
  });

  it("constructs exact agent commands", () => {
    const workspace = "/tmp/furmark-workspace";
    expect(buildAgentCommand("claude-code", workspace).command).toContain("claude -p --safe-mode --model claude-opus-4-8");
    expect(buildAgentCommand("opencode", workspace).command).toContain("opencode run --pure --model zai-coding-plan/glm-5.2");
    expect(buildAgentCommand("codex", workspace).command).toContain("codex exec -C /tmp/furmark-workspace");
    expect(buildAgentCommand("codex", workspace).command).toContain("--model gpt-5.5");
  });

  it("plans OpenCode GLM runs last in the full matrix", async () => {
    const tasks = await loadTaskSpecs();
    const cases = selectCases({ matrix: "full" }, tasks);
    const firstOpenCode = cases.findIndex((caseSpec) => caseSpec.agent === "opencode");
    const lastNonOpenCode = cases.findLastIndex((caseSpec) => caseSpec.agent !== "opencode");
    expect(firstOpenCode).toBeGreaterThan(0);
    expect(firstOpenCode).toBeGreaterThan(lastNonOpenCode);
  });

  it("resumes by reusing passed run artifacts unless forced", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "furmark-resume-"));
    await fs.cp(path.join(process.cwd(), "tasks"), path.join(root, "tasks"), { recursive: true });
    await fs.cp(path.join(process.cwd(), "skills"), path.join(root, "skills"), { recursive: true });

    const selection = {
      agent: "codex" as const,
      mode: "baseline" as const,
      task: "coding-cache" as const,
      batchId: "resume-test",
      dryRun: true,
      resume: true,
    };
    const [first] = await runBenchmark(selection, root);
    expect(first?.status).toBe("passed");

    const runJsonPath = path.join(root, "public", "results", "batches", "resume-test", first!.runId, "run.json");
    const runJson = JSON.parse(await fs.readFile(runJsonPath, "utf8"));
    runJson.durationMs = 123_456;
    await fs.writeFile(runJsonPath, `${JSON.stringify(runJson, null, 2)}\n`);

    const [resumed] = await runBenchmark(selection, root);
    expect(resumed?.durationMs).toBe(123_456);

    const [forced] = await runBenchmark({ ...selection, force: true }, root);
    expect(forced?.durationMs).not.toBe(123_456);
  });

  it("parses JSON agent output and token usage", () => {
    const parsed = parseAgentOutput(
      JSON.stringify({
        final: "Done",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      }),
    );
    expect(parsed.finalMessage).toBe("Done");
    expect(parsed.tokenUsage?.totalTokens).toBe(15);
  });

  it("scores deterministic artifacts", async () => {
    const task = await loadTaskSpec("animation-orbit-field");
    const scores = scoreRun({
      task,
      exitCode: 0,
      finalText: "Implemented and tested.",
      diffText: "diff --git a/src/App.tsx b/src/App.tsx\n+const ok = true;\n",
      metrics: {
        testPassRate: 1,
        nonblankPixels: true,
        responsiveRender: true,
        consoleErrors: 0,
        frameDifference: 0.2,
        pauseBehavior: true,
        reducedMotion: true,
      },
      screenshotCount: 2,
    });
    expect(scores.correctness).toBe(100);
    expect(scores.visual).toBe(100);
    expect(scores.animation).toBe(100);
    expect(scores.total).toBeGreaterThan(90);
  });
});
