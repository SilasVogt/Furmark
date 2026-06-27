import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir } from "../src/bench/files";

const args = process.argv.slice(2);
if (args[0] !== "import" || args[1] !== "ponytail") {
  throw new Error("Usage: pnpm bench:skill import ponytail --from <path>");
}

const fromIndex = args.indexOf("--from");
const source = fromIndex >= 0 ? args[fromIndex + 1] : null;
if (!source) throw new Error("Usage: pnpm bench:skill import ponytail --from <path>");

const stat = await fs.stat(source);
const sourceFile = stat.isDirectory() ? path.join(source, "SKILL.md") : source;
const content = await fs.readFile(sourceFile, "utf8");
const targetDir = path.join(process.cwd(), "skills", "ponytail");
await ensureDir(targetDir);
await fs.writeFile(path.join(targetDir, "SKILL.md"), content);
console.log(`imported ponytail skill from ${sourceFile}`);

