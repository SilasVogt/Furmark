import type { AgentId } from "./schema";

export type AgentCommand = {
  agent: AgentId;
  label: string;
  model: string;
  effort: string;
  bin: string;
  args: string[];
  command: string;
  cwd: string;
  stdin: true;
};

const shellQuote = (value: string): string => {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
};

export function buildAgentCommand(agent: AgentId, workspacePath: string): AgentCommand {
  if (agent === "claude-code") {
    const args = [
      "-p",
      "--safe-mode",
      "--model",
      "claude-opus-4-8",
      "--effort",
      "max",
      "--permission-mode",
      "bypassPermissions",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
      "--no-session-persistence",
    ];
    return makeCommand(agent, "Claude Code", "claude-opus-4-8", "max", "claude", args, workspacePath);
  }

  if (agent === "opencode") {
    const args = [
      "run",
      "--pure",
      "--model",
      "zai-coding-plan/glm-5.2",
      "--variant",
      "max",
      "--format",
      "json",
      "--dangerously-skip-permissions",
      "--dir",
      workspacePath,
    ];
    return makeCommand(agent, "OpenCode", "zai-coding-plan/glm-5.2", "max", "opencode", args, workspacePath);
  }

  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "-C",
    workspacePath,
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--model",
    "gpt-5.5",
    "-c",
    'model_reasoning_effort="xhigh"',
    "--sandbox",
    "workspace-write",
    "--json",
  ];
  return makeCommand(agent, "Codex", "gpt-5.5", "xhigh", "codex", args, workspacePath);
}

function makeCommand(
  agent: AgentId,
  label: string,
  model: string,
  effort: string,
  bin: string,
  args: string[],
  workspacePath: string,
): AgentCommand {
  return {
    agent,
    label,
    model,
    effort,
    bin,
    args,
    command: [bin, ...args].map(shellQuote).join(" "),
    cwd: workspacePath,
    stdin: true,
  };
}

export function normalizeAgent(input: string): AgentId {
  if (input === "claude" || input === "claude-code") return "claude-code";
  if (input === "open-code" || input === "opencode") return "opencode";
  if (input === "codex") return "codex";
  throw new Error(`Unknown agent: ${input}`);
}
