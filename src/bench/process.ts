import { spawn } from "node:child_process";

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};

export async function runProcess(
  bin: string,
  args: string[],
  options: { cwd: string; input?: string; timeoutMs?: number },
): Promise<ExecResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          child.kill("SIGTERM");
          stderr += `\nTimed out after ${options.timeoutMs}ms\n`;
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
    });
    child.on("close", (exitCode) => {
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, durationMs: Date.now() - start });
    });
    child.stdin.end(options.input ?? "");
  });
}

