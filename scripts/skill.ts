import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ensureDir } from "../src/bench/files";

const args = process.argv.slice(2);
if (args[0] !== "import" || args[1] !== "ponytail") {
  throw new Error("Usage: pnpm bench:skill import ponytail --from <path>");
}

const fromIndex = args.indexOf("--from");
const source = fromIndex >= 0 ? args[fromIndex + 1] : null;
if (!source) throw new Error("Usage: pnpm bench:skill import ponytail --from <path>");

const sourceFile = await resolveSourceFile(source);
const content = await fs.readFile(sourceFile, "utf8");
const targetDir = path.join(process.cwd(), "skills", "ponytail");
await ensureDir(targetDir);
await fs.writeFile(path.join(targetDir, "SKILL.md"), content);
console.log(`imported ponytail skill from ${sourceFile}`);

async function resolveSourceFile(source: string): Promise<string> {
  if (isGitHubSource(source)) {
    const repo = parseGitHubRepo(source);
    const checkout = await fs.mkdtemp(path.join(os.tmpdir(), "furmark-ponytail-"));
    const clone = spawnSync("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, checkout], {
      stdio: "inherit",
    });
    if (clone.status !== 0) throw new Error(`Failed to clone ${repo}`);
    return path.join(checkout, "skills", "ponytail", "SKILL.md");
  }

  const stat = await fs.stat(source);
  return stat.isDirectory() ? path.join(source, "SKILL.md") : source;
}

function isGitHubSource(source: string): boolean {
  return source.startsWith("github:") || source.startsWith("https://github.com/");
}

function parseGitHubRepo(source: string): string {
  if (source.startsWith("github:")) return source.slice("github:".length).replace(/\.git$/, "");
  const url = new URL(source);
  const parts = url.pathname.replace(/^\/|\.git$/g, "").split("/");
  if (parts.length < 2) throw new Error(`Expected a GitHub repository URL, got ${source}`);
  return `${parts[0]}/${parts[1]}`;
}
