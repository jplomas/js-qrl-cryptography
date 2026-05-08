import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const timeoutMs = 600000;
const logIntervalMs = 30000;

function listBundles(bundler) {
  if (bundler === "webpack") {
    return ["/test-builds/main.js"];
  }
  const dir = path.join(repoRoot, "test-builds", bundler);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => `/test-builds/${bundler}/${name}`);
}

const bundlers = ["parcel", "webpack", "rollup"];

for (const bundler of bundlers) {
  test(`browser tests under ${bundler}`, async ({ page }) => {
    const logs = [];
    page.on("console", (msg) => {
      const line = `[console:${msg.type()}] ${msg.text()}`;
      logs.push(line);
      console.log(`[${bundler}] ${line}`);
    });
    page.on("pageerror", (err) => {
      const line = `[pageerror] ${err.message || String(err)}`;
      logs.push(line);
      console.log(`[${bundler}] ${line}`);
    });

    await page.goto("/browser-tests/runner.html");

    for (const bundle of listBundles(bundler)) {
      await page.addScriptTag({ url: bundle });
    }

    await page.evaluate(() => window.__startMocha());

    const start = Date.now();
    let lastLog = 0;
    let result = null;

    while (true) {
      result = await page.evaluate(() => window.__mochaDone);
      if (result) break;

      const elapsed = Date.now() - start;
      if (elapsed - lastLog >= logIntervalMs) {
        const progress = await page.evaluate(() => window.__mochaProgress);
        if (progress) {
          console.log(
            `[${bundler}] ${progress.passed} passed, ${progress.failed} failed, ` +
              `${progress.pending} pending, ${progress.started} started. ` +
              `Current: ${progress.current || "unknown"}`,
          );
        }
        lastLog = elapsed;
      }

      if (elapsed > timeoutMs) {
        const progress = await page.evaluate(() => window.__mochaProgress);
        const progressLine = progress
          ? `Progress: ${progress.passed} passed, ${progress.failed} failed, ${progress.pending} pending, ${progress.started} started. Current: ${progress.current || "unknown"}`
          : "Progress: unavailable";
        const logOutput = logs.length ? `\nConsole:\n${logs.join("\n")}` : "";
        throw new Error(
          `Browser tests timed out after ${timeoutMs}ms.\n${progressLine}${logOutput}`,
        );
      }

      await page.waitForTimeout(1000);
    }

    const details = Array.isArray(result.details) ? result.details.join("\n") : "";
    const logOutput = logs.length ? `\nConsole:\n${logs.join("\n")}` : "";
    expect(result.failures, `${details}${logOutput}`).toBe(0);
  });
}
