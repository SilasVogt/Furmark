import type { LoadedSkill } from "./skills";
import type { TaskSpec } from "./schema";

export type PromptInput = {
  task: TaskSpec;
  skill: LoadedSkill;
};

export function assemblePrompt({ task, skill }: PromptInput): string {
  const parts = [
    `# Furmark Task: ${task.title}`,
    "",
    `Task ID: ${task.id}`,
    `Category: ${task.category}`,
    "",
    "You are running in an isolated benchmark workspace. Implement the requested work, keep edits inside the workspace, run the most relevant verification command, and finish with a concise final response.",
    "",
    "## Requested Work",
    task.prompt.trim(),
    "",
    "## Success Criteria",
    ...task.successCriteria.map((criterion) => `- ${criterion}`),
  ];

  if (skill.content.trim().length > 0) {
    parts.push(
      "",
      "## Prompt-Injected Skill Instructions",
      `Skill name: ${skill.skillName}`,
      `Skill path: ${skill.skillPath}`,
      "",
      skill.content.trim(),
    );
  } else {
    parts.push("", "## Skill Mode", "No extra skill instructions are active for this baseline run.");
  }

  parts.push(
    "",
    "## Final Response Contract",
    "Report what changed and which verification command ran. Do not include benchmark metadata unless it is relevant to the task result.",
  );

  return `${parts.join("\n")}\n`;
}

