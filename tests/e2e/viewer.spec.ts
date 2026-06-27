import { test, expect } from "@playwright/test";

test("viewer loads seeded dry-run results", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Benchmark comparison" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Matrix" })).toBeVisible();
  await expect(page.getByText("Claude Code")).toBeVisible();
  await page.getByRole("tab", { name: "Side by side" }).click();
  await expect(page.getByRole("heading", { name: "Select runs" })).toBeVisible();
  await page.getByRole("button", { name: "Metrics" }).first().click();
  await expect(page.getByLabel("Artifact drawer")).toBeVisible();
});

