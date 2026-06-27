import { test, expect } from "@playwright/test";
import { validateAnimationPage, validateLandingPage } from "../../src/bench/validators/browser";

test("landing validator accepts a responsive public page", async ({ page }) => {
  await page.setContent(`
    <main>
      <header><nav><a href="#book">Book</a><a href="#help">Help</a></nav></header>
      <section><h1>Civic Slot appointments</h1><p>Book local services with clear availability, accessible controls, and support information for residents.</p><button>Start booking</button></section>
      <section><h2>Services</h2><p>Permits, records, housing, and benefit appointments are grouped by location and urgency.</p></section>
      <section id="help"><h2>Support</h2><p>Call, email, or visit the desk if online booking is not the right path.</p></section>
    </main>
  `);
  const result = await validateLandingPage(page);
  expect(result.nonblankPixels).toBe(true);
  expect(result.responsiveRender).toBe(true);
});

test("animation validator detects frame changes and pause controls", async ({ page }) => {
  await page.setContent(`
    <button aria-label="Pause animation">Pause</button>
    <canvas width="160" height="100"></canvas>
    <script>
      const canvas = document.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      let x = 0;
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#17664a";
        ctx.fillRect(x, 20, 40, 40);
        x = (x + 8) % 120;
        requestAnimationFrame(draw);
      }
      draw();
    </script>
  `);
  const result = await validateAnimationPage(page);
  expect(result.nonblankPixels).toBe(true);
  expect(result.frameDifference).toBeGreaterThan(0);
  expect(result.pauseBehavior).toBe(true);
});

