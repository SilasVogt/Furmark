import { promises as fs } from "node:fs";
import path from "node:path";
import { TASKS } from "./constants";
import { TaskSpecSchema, type TaskId, type TaskSpec } from "./schema";

export async function loadTaskSpec(taskId: TaskId, repoRoot = process.cwd()): Promise<TaskSpec> {
  const filePath = path.join(repoRoot, "tasks", taskId, "task.json");
  const raw = await fs.readFile(filePath, "utf8");
  return TaskSpecSchema.parse(JSON.parse(raw));
}

export async function loadTaskSpecs(repoRoot = process.cwd()): Promise<TaskSpec[]> {
  const specs = await Promise.all(TASKS.map((taskId) => loadTaskSpec(taskId, repoRoot)));
  return specs.sort((a, b) => TASKS.indexOf(a.id) - TASKS.indexOf(b.id));
}

export function isBrowserTask(task: TaskSpec): boolean {
  return task.category === "landing-page" || task.category === "browser-animation";
}

