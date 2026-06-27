import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import { createServer } from "node:net";
import path from "node:path";
import { validateAnimationPage, validateLandingPage } from "./validators/browser";
import type { TaskSpec } from "./schema";

export async function verifyBrowserWorkspace(input: {
  workspacePath: string;
  task: TaskSpec;
  screenshotDir: string;
}): Promise<Record<string, unknown>> {
  const port = await getFreePort();
  const server = startVite(input.workspacePath, port);
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(url, 10_000);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const validation =
      input.task.category === "browser-animation" ? await validateAnimationPage(page, url) : await validateLandingPage(page, url);
    await page.screenshot({ path: path.join(input.screenshotDir, "desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(input.screenshotDir, "mobile.png"), fullPage: true });
    await browser.close();
    return validation;
  } finally {
    server.kill("SIGTERM");
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("Unable to allocate port"));
      });
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite(workspacePath: string, port: number): ChildProcess {
  return spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: workspacePath,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
