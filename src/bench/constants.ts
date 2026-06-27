import type { AgentId, Mode, TaskId } from "./schema";

export const AGENTS: readonly AgentId[] = ["claude-code", "opencode", "codex"];
export const MODES: readonly Mode[] = ["baseline", "ponytail", "furry"];
export const TASKS: readonly TaskId[] = [
  "landing-incident-console",
  "landing-civic-booking",
  "landing-hardware-studio",
  "animation-orbit-field",
  "animation-scroll-machine",
  "animation-data-rain",
  "coding-cache",
  "coding-intervals",
  "coding-dependency-batches",
];

export const AGENT_LABELS: Record<AgentId, string> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  codex: "Codex",
};

export const MODE_LABELS: Record<Mode, string> = {
  baseline: "Baseline",
  ponytail: "Ponytail",
  furry: "Furry",
};

