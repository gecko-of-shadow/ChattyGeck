// Long-running stability check: opens ZooChattr in headless Chrome, joins live channels
// anonymously, and logs memory / DOM / message counters once a minute.
//
//   SOAK_URL=http://127.0.0.1:17420 SOAK_MINUTES=60 SOAK_CHANNELS=xqc,summit1g npm run soak
//   SOAK_MOCK=1 SOAK_MINUTES=45 npm run soak          (mock UI on :17440, Windows Chrome auto-detected)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

function defaultChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

const mockMode = process.env.SOAK_MOCK === "1";
const url = process.env.SOAK_URL ?? (mockMode ? "http://127.0.0.1:17440" : "http://127.0.0.1:17420");
const minutes = Number(process.env.SOAK_MINUTES ?? 60);
const intervalMs = Number(process.env.SOAK_INTERVAL_MS ?? 60_000);
const channels = (process.env.SOAK_CHANNELS ?? (mockMode ? "geckotown,lizardlounge,penguinpond,elephantroom" : "xqc,summit1g"))
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
const outDir = process.env.SOAK_OUT ?? "soak";
const chromePath = defaultChromePath();

fs.mkdirSync(outDir, { recursive: true });
const log = fs.createWriteStream(path.join(outDir, "soak.jsonl"), { flags: "a" });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(url);
await page.evaluate(
  (list) =>
    localStorage.setItem(
      "zoochattr.settings",
      JSON.stringify({
        channels: list,
        gridChannels: list,
        gridSlots: Math.min(9, list.length),
        mode: "grid",
        confirmChannelSwitch: false,
        rememberChatHistory: false,
        autoCheckUpdates: false,
      }),
    ),
  channels,
);
await page.reload();
if (mockMode && process.env.SOAK_HEAVY !== "0") {
  await fetch("http://127.0.0.1:17423/__heavy?rate=50", { method: "POST" });
}

const started = Date.now();
let sample = 0;
while (Date.now() - started < minutes * 60_000) {
  await page.waitForTimeout(intervalMs);
  sample++;
  const stats = await page.evaluate(() => {
    if (typeof gc === "function") gc();
    const memory = performance.memory;
    return {
      ...(window.__zoochattrStats?.() ?? {}),
      heapMB: memory ? Number((memory.usedJSHeapSize / 1048576).toFixed(1)) : null,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
  const row = {
    t: new Date().toISOString(),
    minute: Number(((Date.now() - started) / 60_000).toFixed(1)),
    ...stats,
    errors: errors.splice(0),
  };
  log.write(`${JSON.stringify(row)}\n`);
  console.log(
    `[${row.minute}m] read=${row.read} received=${row.received} rows=${row.rows} ` +
      `heap=${row.heapMB}MB dom=${row.domNodes} errors=${row.errors.length}`,
  );
  if (sample % 15 === 0) await page.screenshot({ path: path.join(outDir, `soak-${sample}m.png`) });
  // Flip views now and then, like a person would.
  if (sample % 10 === 5) await page.getByRole("radio", { name: /focused/i }).click().catch(() => {});
  if (sample % 10 === 0) await page.getByRole("radio", { name: /grid/i }).click().catch(() => {});
}

await page.screenshot({ path: path.join(outDir, "soak-final.png") });
if (mockMode) await fetch("http://127.0.0.1:17423/__heavy/off", { method: "POST" }).catch(() => {});
await browser.close();
log.end();
