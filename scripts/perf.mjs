// Measures the mock UI. Rust/WebView2 numbers need a built ZooChattr.exe.
//   node scripts/perf.mjs
import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const url = process.env.E2E_URL ?? "http://127.0.0.1:17440";
const chromePath =
  process.env.CHROME_PATH ??
  ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const sha = process.env.PERF_SHA ?? "working-tree";
const outDir = "perf";
fs.mkdirSync(outDir, { recursive: true });

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[i].toFixed(2));
}
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, p50: pct(sorted, 50), p95: pct(sorted, 95) };
};

let profileDir = "";
async function sampleProcs() {
  const marker = profileDir.replace(/'/g, "''");
  const script = `
$marker = '${marker}'
$all = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($marker) }
$ids = @($all | ForEach-Object { $_.ProcessId })
if (-not $ids.Count) { '{"ws":0,"cpu":0,"n":0}'; exit }
$rows = Get-Process -Id $ids -ErrorAction SilentlyContinue
$ws = ($rows | Measure-Object WorkingSet64 -Sum).Sum
$cpu = ($rows | Measure-Object CPU -Sum).Sum
[pscustomobject]@{ ws=$ws; cpu=$cpu; n=@($rows).Count } | ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], { windowsHide: true });
  const parsed = JSON.parse(stdout.trim() || '{"ws":0,"cpu":0,"n":0}');
  return { ws: Number(parsed.ws) || 0, cpu: Number(parsed.cpu) || 0, n: Number(parsed.n) || 0 };
}
async function cpuWindow(ms) {
  const a = await sampleProcs();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, ms));
  const b = await sampleProcs();
  const dt = (Date.now() - t0) / 1000;
  return {
    cpuPctOfOneCore: dt > 0 ? Number((((b.cpu - a.cpu) / dt) * 100).toFixed(1)) : null,
    ramMB: Number((b.ws / 1048576).toFixed(1)),
    processes: b.n,
  };
}

async function open(channels, extra = {}) {
  profileDir = `C:\\Users\\Bran\\AppData\\Local\\Temp\\zoo-perf-${channels.length}-${Date.now()}`;
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
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
    spellCheck: true,
    ...extra,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".chat-row").first().waitFor({ timeout: 20_000 });
  return { context, page, errors, startupMs: Date.now() - t0 };
}

async function typing(page) {
  await page.evaluate(() => {
    window.__handler = [];
    window.__paint = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name !== "keydown") continue;
        window.__handler.push(entry.processingEnd - entry.startTime);
        window.__paint.push(entry.duration);
      }
    }).observe({ type: "event", durationThreshold: 0 });
  });
  const input = page.getByLabel(/Message #/i).first();
  if (!(await input.count())) return { handler: summarize([]), paint: summarize([]), note: "no composer (logged out)" };
  await input.click();
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.keyboard.type("hello perf typing", { delay: 16 });
  await page.waitForTimeout(300);
  const raw = await page.evaluate(() => ({ handler: window.__handler.slice(), paint: window.__paint.slice() }));
  return { handler: summarize(raw.handler), paint: summarize(raw.paint) };
}

async function login(page) {
  await page.getByRole("button", { name: /^Log in$/ }).click();
  await page.getByRole("button", { name: "Get a login code" }).click();
  await page.getByText("Logged in · can chat").waitFor({ timeout: 20_000 });
  const unlock = page.getByTestId("channel-switch-unlock");
  if (await unlock.count()) await unlock.first().click();
}

const report = {
  sha,
  measuredAt: new Date().toISOString(),
  host: "headless Chrome against the mock UI, not the Tauri WebView2 process",
};
const one = await open(["geckotown"]);
report.startup1ChatMs = one.startupMs;
report.idle1 = await cpuWindow(2500);
await one.context.close();

const four = await open(["geckotown", "lizardlounge", "penguinpond", "elephantroom"]);
report.startup4ChatMs = four.startupMs;
report.idle4 = await cpuWindow(2500);
await fetch("http://127.0.0.1:17423/__heavy?rate=50", { method: "POST" });
report.busy4 = await cpuWindow(4000);
await fetch("http://127.0.0.1:17423/__heavy/off", { method: "POST" });
await login(four.page);
report.typingSpellOn = await typing(four.page);

const toggles = [];
for (let i = 0; i < 30; i++) {
  const t0 = Date.now();
  await four.page.keyboard.press("Control+g");
  await four.page.waitForTimeout(30);
  toggles.push(Date.now() - t0);
}
report.toggleMs = summarize(toggles);
const swaps = [];
for (let i = 0; i < 30; i++) {
  const t0 = Date.now();
  await four.page.keyboard.press("Alt+Shift+ArrowRight");
  await four.page.waitForTimeout(20);
  swaps.push(Date.now() - t0);
}
report.swapMs = summarize(swaps);
report.pageErrors = four.errors;
await four.context.close();

const spellOff = await open(["geckotown", "lizardlounge"], { spellCheck: false });
await login(spellOff.page);
report.typingSpellOff = await typing(spellOff.page);
await spellOff.context.close();

const outPath = `${outDir}/${sha}.json`;
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
