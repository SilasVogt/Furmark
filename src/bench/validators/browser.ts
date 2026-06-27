import type { Page } from "@playwright/test";

export type BrowserValidation = {
  nonblankPixels: boolean;
  responsiveRender: boolean;
  consoleErrors: number;
  frameDifference?: number;
  pauseBehavior?: boolean;
  reducedMotion?: boolean;
};

export async function validateLandingPage(page: Page, url?: string): Promise<BrowserValidation> {
  const consoleErrors = await collectConsoleErrors(page, async () => {
    if (url) await page.goto(url, { waitUntil: "networkidle" });
  });
  const nonblankPixels = await page.evaluate(() => {
    const body = document.body;
    const text = body.innerText.trim();
    const elements = [...document.querySelectorAll("main, section, header, button, a")];
    return text.length > 80 && elements.length >= 5;
  });
  const responsiveRender = await checkResponsive(page);
  return { nonblankPixels, responsiveRender, consoleErrors };
}

export async function validateAnimationPage(page: Page, url?: string): Promise<BrowserValidation> {
  const consoleErrors = await collectConsoleErrors(page, async () => {
    if (url) await page.goto(url, { waitUntil: "networkidle" });
  });
  const before = await captureCanvasSignature(page);
  await page.waitForTimeout(450);
  const after = await captureCanvasSignature(page);
  const frameDifference = before && after ? signatureDifference(before, after) : 0;
  const pauseBehavior = await checkPauseButton(page);
  const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").media.includes("prefers-reduced-motion"));
  const responsiveRender = await checkResponsive(page);
  return {
    nonblankPixels: Boolean(after?.some((value) => value > 0)),
    responsiveRender,
    consoleErrors,
    frameDifference,
    pauseBehavior,
    reducedMotion,
  };
}

async function collectConsoleErrors(page: Page, action: () => Promise<void>): Promise<number> {
  let count = 0;
  const listener = (message: { type: () => string }) => {
    if (message.type() === "error") count += 1;
  };
  page.on("console", listener);
  await action();
  page.off("console", listener);
  return count;
}

async function checkResponsive(page: Page): Promise<boolean> {
  const desktop = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  await page.setViewportSize(desktop);
  return mobileOk;
}

async function captureCanvasSignature(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    if (canvas.width === 0 || canvas.height === 0) return null;
    const width = 64;
    const height = 64;
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const context = sample.getContext("2d");
    if (!context) return null;
    context.drawImage(canvas, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const signature: number[] = [];
    for (let index = 0; index < data.length; index += 64) {
      signature.push(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0);
    }
    return signature;
  });
}

function signatureDifference(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let delta = 0;
  for (let index = 0; index < length; index += 1) {
    delta += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return Math.round((delta / (length * 255)) * 1000) / 1000;
}

async function checkPauseButton(page: Page): Promise<boolean> {
  const button = page.getByRole("button", { name: /pause|play|resume/i }).first();
  if ((await button.count()) === 0) return false;
  await button.click();
  return true;
}
