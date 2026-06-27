import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentCommand } from "../src/bench/adapters";
import { parseAgentOutput } from "../src/bench/result-parser";
import { scoreRun } from "../src/bench/scoring";
import { loadSkillForMode } from "../src/bench/skills";
import { assemblePrompt } from "../src/bench/prompts";
import { loadTaskSpec } from "../src/bench/tasks";

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
