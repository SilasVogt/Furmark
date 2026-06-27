import { promises as fs } from "node:fs";
import path from "node:path";
import { sha256Text } from "./hash";
import type { Mode, StructuredError } from "./schema";

export type LoadedSkill = {
  mode: Mode;
  skillName: string | null;
  skillPath: string | null;
  skillSha256: string | null;
  content: string;
  setupError: StructuredError | null;
};

export async function loadSkillForMode(mode: Mode, repoRoot = process.cwd()): Promise<LoadedSkill> {
  if (mode === "baseline") {
    return {
      mode,
      skillName: "baseline",
      skillPath: null,
      skillSha256: null,
      content: "",
      setupError: null,
    };
  }

  const skillName = mode;
  const skillPath = path.join("skills", mode, "SKILL.md");
  const absolutePath = path.join(repoRoot, skillPath);

  try {
    const content = await fs.readFile(absolutePath, "utf8");
    return {
      mode,
      skillName,
      skillPath,
      skillSha256: sha256Text(content),
      content,
      setupError: null,
    };
  } catch (error) {
    const message =
      mode === "ponytail"
        ? "Ponytail skill is not installed. Run pnpm bench:skill import ponytail --from <path> before official ponytail runs."
        : `Skill file is missing for mode ${mode}.`;
    return {
      mode,
      skillName,
      skillPath,
      skillSha256: null,
      content: "",
      setupError: {
        code: "skill_missing",
        message,
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

