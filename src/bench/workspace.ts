import { promises as fs } from "node:fs";
import path from "node:path";
import type { TaskSpec } from "./schema";
import { copyDir, ensureDir, pathExists, writeText } from "./files";
import { runProcess } from "./process";

export async function prepareWorkspace(input: {
  repoRoot: string;
  task: TaskSpec;
  workspacePath: string;
  installDependencies: boolean;
}): Promise<{ verification: string[] }> {
  await fs.rm(input.workspacePath, { recursive: true, force: true });
  await ensureDir(input.workspacePath);

  const fixturePath = input.task.fixturePath ? path.join(input.repoRoot, input.task.fixturePath) : null;
  if (fixturePath && (await pathExists(fixturePath))) {
    await copyDir(fixturePath, input.workspacePath);
  } else if (input.task.category === "pure-coding") {
    await createCodingWorkspace(input.workspacePath);
  } else {
    await createBrowserWorkspace(input.workspacePath);
  }

  await runProcess("git", ["init"], { cwd: input.workspacePath });
  await runProcess("git", ["add", "."], { cwd: input.workspacePath });
  await runProcess(
    "git",
    ["-c", "user.name=Furmark", "-c", "user.email=furmark@example.invalid", "commit", "-m", "fixture"],
    { cwd: input.workspacePath },
  );

  const verification: string[] = [];
  if (input.installDependencies && (await pathExists(path.join(input.workspacePath, "package.json")))) {
    const install = await runProcess("pnpm", ["install", "--ignore-scripts"], {
      cwd: input.workspacePath,
      timeoutMs: 180_000,
    });
    verification.push(`pnpm install --ignore-scripts exited ${install.exitCode}`);
  }

  return { verification };
}

export async function collectWorkspaceDiff(workspacePath: string): Promise<string> {
  const result = await runProcess("git", ["diff", "--binary"], { cwd: workspacePath, timeoutMs: 30_000 });
  return result.stdout || result.stderr;
}

async function createCodingWorkspace(workspacePath: string): Promise<void> {
  await writeText(
    path.join(workspacePath, "package.json"),
    JSON.stringify(
      {
        type: "module",
        scripts: {
          test: "vitest run",
          build: "tsc --noEmit",
        },
        dependencies: {},
        devDependencies: {
          typescript: "^5.9.3",
          vitest: "^4.0.16",
        },
      },
      null,
      2,
    ),
  );
  await writeText(
    path.join(workspacePath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          types: ["vitest/globals"],
        },
        include: ["src", "tests"],
      },
      null,
      2,
    )}\n`,
  );
  await writeText(path.join(workspacePath, "src", "index.ts"), "export {};\n");
}

async function createBrowserWorkspace(workspacePath: string): Promise<void> {
  await writeText(
    path.join(workspacePath, "package.json"),
    `${JSON.stringify(
      {
        type: "module",
        scripts: {
          dev: "vite --host 127.0.0.1",
          build: "tsc --noEmit && vite build",
          test: "vitest run",
        },
        dependencies: {
          "@vitejs/plugin-react": "^5.1.1",
          vite: "^7.2.7",
          typescript: "^5.9.3",
          react: "^19.2.3",
          "react-dom": "^19.2.3",
          "lucide-react": "^0.561.0",
        },
        devDependencies: {
          "@types/react": "^19.2.7",
          "@types/react-dom": "^19.2.3",
          vitest: "^4.0.16",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeText(
    path.join(workspacePath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          lib: ["ES2023", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["src", "vite.config.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeText(
    path.join(workspacePath, "vite.config.ts"),
    'import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react()] });\n',
  );
  await writeText(
    path.join(workspacePath, "index.html"),
    '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Furmark Task</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  );
  await writeText(
    path.join(workspacePath, "src", "main.tsx"),
    'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "./style.css";\n\nfunction App() {\n  return <main><h1>Furmark task workspace</h1></main>;\n}\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
  );
  await writeText(path.join(workspacePath, "src", "style.css"), "body { margin: 0; font-family: system-ui, sans-serif; }\n");
}
