// Screenshots of the grid at the sizes Part 2 calls for.
// The mock UI must already be running (npm run dev:mock and npm run mock:twitch).
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const url = process.env.E2E_URL ?? "http://127.0.0.1:17440";
const out = "test-results/layout";
const chromePath =
  process.env.CHROME_PATH ??
  ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const names = ["geckotown", "lizardlounge", "penguinpond", "elephantroom", "crestedgecko", "seaturtle", "daygecko", "tokaygecko", "leopardgecko"];
const sizes = [
  [800, 600],
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
  [1080, 1920],
];
const counts = [1, 2, 4, 9];

fs.mkdirSync(out, { recursive: true });
await fetch("http://127.0.0.1:17423/__unfail-emotes", { method: "POST" }).catch(() => {});

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  for (const scale of [1, 1.5]) {
    for (const [width, height] of sizes) {
      for (const count of counts) {
        const channels = names.slice(0, count);
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: scale,
        });
        await context.addInitScript((settings) => {
          localStorage.setItem("zoochattr.settings", JSON.stringify(settings));
        }, {
          channels,
          gridChannels: channels,
          gridSlots: 9,
          mode: "grid",
          focused: channels[0],
          confirmChannelSwitch: false,
          rememberChatHistory: false,
          autoCheckUpdates: false,
        });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.locator(".chat-row").first().waitFor({ timeout: 20_000 });
        const file = `${out}/${count}-${width}x${height}@${scale}.png`;
        await page.screenshot({ path: file });
        console.log("  ok ", file);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
