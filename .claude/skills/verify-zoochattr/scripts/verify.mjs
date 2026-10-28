#!/usr/bin/env node
// ZooChattr verification harness. Launch, doctor, drive, and cleanup.
// See ../SKILL.md. Does not kill processes it did not start.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dns from "node:dns/promises";

const W3C_ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function repoRoot() {
  let dir = SCRIPT_DIR;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      const json = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (json.name === "zoochattr") return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the ZooChattr repo root (package.json name zoochattr).");
}

const REPO = repoRoot();
const POINTER_DIR = path.join(os.tmpdir(), "zoochattr-verify");
const POINTER = path.join(POINTER_DIR, "current.json");
const VERIFY_WINDOW_TITLE = "ZooChattr verify";

/** True when `candidate` is a directory inside `root`, not the root itself and not a sibling prefix. */
export function isInsideRoot(candidate, root, pathApi = path) {
  if (typeof candidate !== "string" || candidate.trim() === "") return false;
  if (typeof root !== "string" || root.trim() === "") return false;
  const rootResolved = pathApi.resolve(root);
  const resolved = pathApi.resolve(candidate);
  const prefix = rootResolved.endsWith(pathApi.sep) ? rootResolved : rootResolved + pathApi.sep;
  return resolved.startsWith(prefix);
}

export function verifyRuntimeRoot() {
  return POINTER_DIR;
}

function removeRuntime(dir) {
  const root = verifyRuntimeRoot();
  if (!isInsideRoot(dir, root)) {
    throw new Error(`Refusing to delete ${dir}. It is not inside ${root}.`);
  }
  let real = path.resolve(dir);
  try {
    real = fs.realpathSync(real);
  } catch {
    // The directory is already gone, or it never existed.
  }
  if (!isInsideRoot(real, root)) {
    throw new Error(`Refusing to delete ${dir} (resolves to ${real}). It is not inside ${root}.`);
  }
  fs.rmSync(real, { recursive: true, force: true });
}

function readPointer() {
  if (!fs.existsSync(POINTER)) return null;
  try {
    return JSON.parse(fs.readFileSync(POINTER, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function nowId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function waitPort(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect({ port, host: "127.0.0.1" }, () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${port} did not open within ${timeoutMs}ms`));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function httpOk(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return res.status;
    } catch {
      // vite or the mock is still starting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not respond within ${timeoutMs}ms`);
}

function chromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function tauriDriverPath() {
  if (process.env.TAURI_DRIVER && fs.existsSync(process.env.TAURI_DRIVER)) return process.env.TAURI_DRIVER;
  const home = process.env.CARGO_HOME || path.join(os.homedir(), ".cargo");
  const candidates = [
    path.join(home, "bin", process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver"),
    "/usr/local/cargo/bin/tauri-driver",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "tauri-driver";
}

function appBinary() {
  const name = process.platform === "win32" ? "zoochattr.exe" : "zoochattr";
  return path.join(REPO, "src-tauri", "target", "debug", name);
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function descendants(pid) {
  if (process.platform === "win32") return [];
  const found = [];
  const childrenOf = new Map();
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let text = "";
    try {
      text = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      continue;
    }
    const right = text.lastIndexOf(")");
    if (right < 0) continue;
    const rest = text.slice(right + 2).split(" ");
    const ppid = Number(rest[1]);
    const child = Number(entry);
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(child);
  }
  const stack = [...(childrenOf.get(pid) ?? [])];
  while (stack.length) {
    const current = stack.pop();
    found.push(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return found;
}

function killPidTree(pid) {
  if (!pid || !alive(pid)) return;
  const kids = descendants(pid);
  for (const child of kids.reverse()) {
    try {
      process.kill(child, "SIGTERM");
    } catch {
      // already gone
    }
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
}

function logLine(rt, line) {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  fs.mkdirSync(rt.evidenceDir, { recursive: true });
  fs.appendFileSync(path.join(rt.evidenceDir, "launch.txt"), text);
  fs.appendFileSync(path.join(rt.runtimeDir, "harness.log"), text);
}

function spawnLogged(rt, name, cmd, args, env) {
  fs.mkdirSync(path.join(rt.runtimeDir, "logs"), { recursive: true });
  const logPath = path.join(rt.runtimeDir, "logs", `${name}.log`);
  const fd = fs.openSync(logPath, "a");
  const child = spawn(cmd, args, {
    cwd: REPO,
    env,
    stdio: ["ignore", fd, fd],
    detached: false,
  });
  child.on("error", (err) => logLine(rt, `${name} failed to start: ${err.message}`));
  logLine(rt, `started ${name} pid ${child.pid}: ${cmd} ${args.join(" ")}`);
  rt.pids[name] = child.pid;
  return child;
}

async function ensurePorts(ports) {
  for (const port of ports) {
    if (!(await portFree(port))) {
      throw new Error(
        `127.0.0.1:${port} is already in use. ZooChattr verification will not take it. Stop the process you started, or run cleanup if it belongs to a previous verification run.`,
      );
    }
  }
}

function version() {
  return JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8")).version;
}

function surface() {
  const raw = (process.env.VERIFY_SURFACE || "desktop").toLowerCase();
  if (raw !== "desktop" && raw !== "browser") throw new Error(`VERIFY_SURFACE must be desktop or browser, got ${raw}`);
  return raw;
}

async function runDaemon() {
  const runId = nowId();
  const runtimeDir = path.join(POINTER_DIR, runId);
  const evidenceDir = path.join(REPO, "verification-evidence", runId);
  const dataDir = path.join(runtimeDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const rt = {
    runId,
    runtimeDir,
    evidenceDir,
    dataDir,
    pids: {},
    surface: surface(),
    drive: null,
    ready: false,
    error: null,
    sessionId: null,
    wdPort: 4444,
    page: null,
    browser: null,
    daemonPid: process.pid,
  };
  fs.writeFileSync(path.join(runtimeDir, "harness.log"), "");
  const pointer = {
    runId,
    runtimeDir,
    evidenceDir,
    dataDir,
    daemonPid: process.pid,
    surface: rt.surface,
    version: version(),
    ready: false,
  };
  fs.mkdirSync(POINTER_DIR, { recursive: true });
  fs.writeFileSync(POINTER, JSON.stringify(pointer, null, 2));
  fs.writeFileSync(path.join(evidenceDir, "run.json"), JSON.stringify({ ...pointer, startedAt: new Date().toISOString() }, null, 2));

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ready: rt.ready, error: rt.error, evidenceDir, runId, drive: rt.drive, surface: rt.surface }));
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(404);
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const result = await handle(rt, body);
      res.writeHead(result.ok === false ? 400 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      if (body.cmd === "shutdown") {
        server.close();
        setTimeout(() => process.exit(0), 50);
      }
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  pointer.daemonPort = server.address().port;
  rt.daemonPort = pointer.daemonPort;
  fs.writeFileSync(POINTER, JSON.stringify(pointer, null, 2));
  logLine(rt, `daemon listening on 127.0.0.1:${pointer.daemonPort}`);

  try {
    await boot(rt);
    rt.ready = true;
    pointer.ready = true;
    pointer.drive = rt.drive;
    pointer.surface = rt.surface;
    fs.writeFileSync(POINTER, JSON.stringify(pointer, null, 2));
    fs.writeFileSync(path.join(evidenceDir, "run.json"), JSON.stringify({ ...pointer, readyAt: new Date().toISOString() }, null, 2));
    logLine(rt, `ready surface=${rt.surface} drive=${rt.drive}`);
  } catch (err) {
    rt.error = String(err?.stack || err);
    logLine(rt, `launch failed: ${rt.error}`);
    fs.writeFileSync(path.join(evidenceDir, "launch-error.txt"), rt.error);
    pointer.error = rt.error;
    fs.writeFileSync(POINTER, JSON.stringify(pointer, null, 2));
    await shutdown(rt);
    process.exit(1);
  }
}

function childEnv(rt) {
  const env = { ...process.env, ZOOCHATTR_DATA_DIR: rt.dataDir };
  // The owner's shell may already point these at real Twitch. Vite lets process env win over .env.mock.
  for (const key of Object.keys(env)) {
    if (
      key === "TWITCH_CLIENT_ID" ||
      key === "TWITCH_CLIENT_SECRET" ||
      key.startsWith("VITE_TWITCH_") ||
      key.startsWith("VITE_7TV") ||
      key.startsWith("VITE_BTTV") ||
      key.startsWith("VITE_FFZ") ||
      key.startsWith("VITE_HISTORY")
    ) {
      delete env[key];
    }
  }
  env.ZOOCHATTR_VERIFY = "1";
  env.VITE_ZOOCHATTR_VERIFY = "1";
  env.TWITCH_CLIENT_ID = "mock-client-id";
  env.VITE_TWITCH_IRC_URL = "ws://127.0.0.1:17422";
  env.VITE_TWITCH_AUTH_BASE = "http://127.0.0.1:17423";
  env.VITE_TWITCH_HELIX_BASE = "http://127.0.0.1:17423/helix";
  env.VITE_7TV_API = "http://127.0.0.1:17423/7tv";
  env.VITE_BTTV_API = "http://127.0.0.1:17423/bttv";
  env.VITE_FFZ_API = "http://127.0.0.1:17423/ffz";
  if (process.platform === "linux") {
    env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
    env.GDK_BACKEND = env.GDK_BACKEND || "x11";
    env.TAURI_WEBVIEW_AUTOMATION = "true";
  }
  if (process.platform === "win32") {
    const port = 9222;
    const extra = `--remote-debugging-port=${port}`;
    const existing = env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS || "";
    env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = existing.includes("remote-debugging-port") ? existing : `${existing} ${extra}`.trim();
    rt.cdpPort = port;
  }
  return env;
}

async function boot(rt) {
  const useBrowser = rt.surface === "browser";
  const devPort = useBrowser ? 17440 : 17420;
  rt.devPort = devPort;
  rt.url = `http://127.0.0.1:${devPort}`;
  const ports = [17422, 17423, devPort];
  if (!useBrowser && process.platform !== "win32") ports.push(4444, 4445);
  if (!useBrowser && process.platform === "win32") ports.push(9222);
  await ensurePorts(ports);

  const env = childEnv(rt);
  spawnLogged(rt, "mock", process.execPath, [path.join(REPO, "scripts", "mock-twitch.mjs")], env);
  await waitPort(17423, 20_000);
  logLine(rt, "mock HTTP is accepting connections on 17423 (GET / is 404; that is enough)");

  if (useBrowser) {
    rt.drive = "browser-stand-in";
    spawnLogged(rt, "vite", process.execPath, [path.join(REPO, "node_modules", "vite", "bin", "vite.js"), "--mode", "mock", "--port", String(devPort), "--host", "127.0.0.1", "--strictPort"], env);
    await httpOk(rt.url, 60_000);
    await startStandInBrowser(rt);
  } else if (process.platform === "win32") {
    rt.drive = "webview-cdp";
    const npm = "npm.cmd";
    spawnLogged(rt, "tauri", npm, ["run", "tauri:mock"], env);
    await httpOk(rt.url, 180_000);
    await httpOk(`http://127.0.0.1:${rt.cdpPort}/json/version`, 180_000);
    await startCdp(rt);
  } else {
    rt.drive = "tauri-driver";
    await ensureDebugBinary(rt, env);
    spawnLogged(rt, "vite", process.execPath, [path.join(REPO, "node_modules", "vite", "bin", "vite.js"), "--mode", "mock", "--port", "17420", "--host", "127.0.0.1", "--strictPort"], env);
    await httpOk(rt.url, 60_000);
    const driver = tauriDriverPath();
    spawnLogged(rt, "tauri-driver", driver, ["--port", "4444", "--native-port", "4445", "--native-driver", "/usr/bin/WebKitWebDriver"], env);
    await waitPort(4444, 20_000);
    await waitPort(4445, 20_000);
    let sessionError = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await createSession(rt);
        sessionError = null;
        break;
      } catch (err) {
        sessionError = err;
        logLine(rt, `webdriver session attempt ${attempt} failed: ${err.message}`);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (sessionError) throw sessionError;
  }

  await waitForHeading(rt, "Nothing in the zoo yet", 90_000);
  if (process.platform === "linux" && rt.surface === "desktop") {
    const shot = path.join(rt.evidenceDir, "launch-window.png");
    const found = grabZooWindow(shot);
    logLine(rt, `saved X11 window grab ${shot} (window ${found.id}, ${found.width}px wide)`);
  }
  const pageShot = path.join(rt.evidenceDir, "launch-page.png");
  await capturePage(rt, pageShot);
  logLine(rt, `saved page screenshot ${pageShot}`);
  if (rt.surface === "desktop") {
    const guardPath = path.join(rt.dataDir, "verify-guard.txt");
    if (!fs.existsSync(guardPath)) throw new Error("verify-guard.txt was not written. ZOOCHATTR_VERIFY=1 did not reach the shell.");
    const guard = fs.readFileSync(guardPath, "utf8");
    assertVerifyGuard(guard);
    fs.writeFileSync(path.join(rt.evidenceDir, "verify-guard.txt"), guard);
    logLine(rt, "verify guard ok");
  }
  // Give a broken update check time to open api.github.com before we look at sockets.
  await new Promise((r) => setTimeout(r, 2000));
  const network = await githubTouch(rt);
  fs.writeFileSync(path.join(rt.evidenceDir, "network-github.json"), JSON.stringify(network, null, 2));
  if (network.contacted) throw new Error(`A verify process connected to GitHub: ${JSON.stringify(network.matches)}`);
  const others = zooProcesses().filter((proc) => !ourPidSet(rt).has(proc.pid));
  if (others.length) logLine(rt, `left other ZooChattr processes alone: ${others.map((item) => item.pid).join(", ")}`);
}

async function ensureDebugBinary(rt, env) {
  const bin = appBinary();
  if (fs.existsSync(bin)) {
    logLine(rt, `debug shell present: ${bin}`);
    return;
  }
  logLine(rt, "debug shell missing; compiling with npm run tauri:mock");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawnLogged(rt, "compile", npm, ["run", "tauri:mock"], env);
  const start = Date.now();
  while (!fs.existsSync(bin)) {
    if (Date.now() - start > 600_000) throw new Error("tauri:mock did not produce src-tauri/target/debug/zoochattr within 10 minutes");
    if (!alive(child.pid)) throw new Error("tauri:mock exited before the debug shell existed. See logs/compile.log in the run directory.");
    await new Promise((r) => setTimeout(r, 1000));
  }
  logLine(rt, "debug shell compiled; stopping the compile launch so tauri-driver can start it");
  killPidTree(child.pid);
  delete rt.pids.compile;
  await new Promise((r) => setTimeout(r, 1000));
  if (!(await portFree(17420))) throw new Error("port 17420 still taken after stopping the compile launch");
}

async function startStandInBrowser(rt) {
  const { chromium } = await import("playwright-core");
  const executablePath = chromePath();
  if (!executablePath) throw new Error("Chrome was not found. Set CHROME_PATH. The browser stand-in is not the Tauri window.");
  const userData = path.join(rt.runtimeDir, "chrome-profile");
  rt.browser = await chromium.launchPersistentContext(userData, {
    executablePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  rt.page = rt.browser.pages()[0] || (await rt.browser.newPage());
  await rt.page.goto(rt.url, { waitUntil: "domcontentloaded" });
  logLine(rt, "STAND-IN: Chrome loaded the Vite page. This is not the Tauri webview and does not write settings.json.");
}

async function startCdp(rt) {
  const { chromium } = await import("playwright-core");
  rt.browser = await chromium.connectOverCDP(`http://127.0.0.1:${rt.cdpPort}`);
  const pages = rt.browser.contexts().flatMap((context) => context.pages());
  rt.page = pages.find((page) => page.url().includes("17420")) || pages[0];
  if (!rt.page) throw new Error("WebView2 remote debugging is up but no page is attached");
  logLine(rt, `attached to WebView2 page ${rt.page.url()}`);
}

async function wd(rt, method, urlPath, body, timeoutMs = 30_000) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${rt.wdPort}${urlPath}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const cause = err?.cause?.message || err?.cause || err?.message || err;
    throw new Error(`WebDriver ${method} ${urlPath} failed: ${cause}`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`WebDriver ${method} ${urlPath} -> ${res.status} ${text.slice(0, 800)}`);
  }
  if (json?.value?.error) {
    throw new Error(`WebDriver ${method} ${urlPath} -> ${json.value.error}: ${json.value.message || text.slice(0, 800)}`);
  }
  return json;
}

async function createSession(rt) {
  const application = appBinary();
  logLine(rt, `creating tauri-driver session for ${application}`);
  const created = await wd(
    rt,
    "POST",
    "/session",
    {
      capabilities: {
        alwaysMatch: {
          browserName: "wry",
          "tauri:options": { application },
        },
      },
    },
    120_000,
  );
  rt.sessionId = created.value?.sessionId || created.sessionId;
  if (!rt.sessionId) throw new Error(`tauri-driver session response had no session id: ${JSON.stringify(created).slice(0, 500)}`);
  logLine(rt, `webdriver session ${rt.sessionId}`);
  const start = Date.now();
  let href = "";
  while (Date.now() - start < 30_000) {
    href = String(await evalInPage(rt, () => location.href));
    if (href.includes("17420")) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  logLine(rt, `webview location ${href}`);
  if (!href.includes("17420")) {
    throw new Error(
      `The debug shell loaded ${href || "(empty)"} instead of http://127.0.0.1:17420. Compile the shell with npm run tauri:mock (not cargo build, and not a release tauri build) so the dev URL is used.`,
    );
  }
}

async function evalInPage(rt, expression, args = []) {
  const argList = Array.isArray(args) ? args : [args];
  if (rt.page) {
    return rt.page.evaluate(expression, ...argList);
  }
  const result = await wd(rt, "POST", `/session/${rt.sessionId}/execute/sync`, {
    script: `return (${expression}).apply(null, arguments)`,
    args: argList,
  });
  return result.value;
}

async function waitForHeading(rt, name, timeoutMs) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      last = await evalInPage(rt, function findHeading(expected) {
        const heading = [...document.querySelectorAll("h1")].map((el) => el.textContent.trim()).find(Boolean) || "";
        const boot = document.body?.innerText?.slice(0, 200) || "";
        return heading || boot;
      }, name);
      if (String(last).includes(name)) return;
    } catch (err) {
      last = String(err.message || err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`UI not usable yet. Waited ${timeoutMs}ms for heading "${name}". Last seen: ${String(last).slice(0, 400)}`);
}

function xWindowId() {
  if (!fs.existsSync("/usr/bin/xdotool") && !commandExists("xdotool")) return null;
  let ids = "";
  try {
    ids = execFileSync("xdotool", ["search", "--name", "ZooChattr"], { encoding: "utf8" });
  } catch {
    return null;
  }
  let best = null;
  for (const id of ids.split(/\s+/).filter(Boolean)) {
    let name = "";
    let geo = "";
    try {
      name = execFileSync("xdotool", ["getwindowname", id], { encoding: "utf8" }).trim();
      geo = execFileSync("xdotool", ["getwindowgeometry", id], { encoding: "utf8" });
    } catch {
      continue;
    }
    const width = Number(geo.match(/Geometry:\s+(\d+)x(\d+)/)?.[1] || 0);
    if (name === VERIFY_WINDOW_TITLE && width > 400) best = { id, width, name };
  }
  return best;
}

function commandExists(name) {
  const pathEnv = process.env.PATH || "";
  return pathEnv.split(path.delimiter).some((dir) => fs.existsSync(path.join(dir, name)));
}

function grabZooWindow(outPath) {
  const found = xWindowId();
  if (!found) throw new Error(`No on-screen window titled "${VERIFY_WINDOW_TITLE}" wider than 400px. A normal ZooChattr window is left alone.`);
  if (!commandExists("import")) throw new Error("ImageMagick import is not installed, so the X11 window cannot be grabbed.");
  execFileSync("import", ["-window", found.id, outPath], { env: process.env });
  return found;
}

async function capturePage(rt, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (rt.page) {
    await rt.page.screenshot({ path: outPath });
    return;
  }
  const shot = await wd(rt, "GET", `/session/${rt.sessionId}/screenshot`);
  fs.writeFileSync(outPath, Buffer.from(shot.value, "base64"));
}

const FIND_SCRIPT = `function(spec) {
  const role = spec.role || "";
  const name = spec.name || "";
  const exact = !!spec.exact;
  const label = spec.label || "";
  const testid = spec.testid || "";
  const id = spec.id || "";
  const attr = spec.attr || "";
  const text = spec.text || "";
  function norm(value) {
    return String(value || "").replace(/\\s+/g, " ").trim();
  }
  function accName(el) {
    if (el.getAttribute("aria-label")) return norm(el.getAttribute("aria-label"));
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) return norm(lab.innerText);
    }
    return norm(el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || "");
  }
  function implicitRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === "BUTTON") return "button";
    if (tag === "A") return "link";
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      return "textbox";
    }
    if (/^H[1-6]$/.test(tag)) return "heading";
    return "";
  }
  function nameOk(value) {
    const hay = norm(value).toLowerCase();
    const needle = norm(name).toLowerCase();
    if (!needle) return true;
    return exact ? hay === needle : hay.includes(needle);
  }
  document.querySelectorAll("[data-verify-target]").forEach((el) => el.removeAttribute("data-verify-target"));
  let matches = [];
  if (testid) matches = [...document.querySelectorAll('[data-testid="' + CSS.escape(testid) + '"]')];
  else if (id) {
    const el = document.getElementById(id);
    matches = el ? [el] : [];
  } else if (label) {
    matches = [...document.querySelectorAll("[aria-label]")].filter((el) => norm(el.getAttribute("aria-label")) === label);
    if (!matches.length) {
      matches = [...document.querySelectorAll("input, textarea, select")].filter((el) => accName(el) === label);
    }
  } else if (attr) {
    const eq = attr.indexOf("=");
    const key = attr.slice(0, eq);
    const value = attr.slice(eq + 1);
    matches = [...document.querySelectorAll("[" + key + "]")].filter((el) => el.getAttribute(key) === value);
  } else if (role) {
    matches = [...document.querySelectorAll("button, a, input, textarea, select, h1, h2, h3, [role]")].filter((el) => {
      if (implicitRole(el) !== role) return false;
      return nameOk(accName(el));
    });
  } else if (text) {
    const needle = norm(text);
    matches = [...document.querySelectorAll("button, a, [role='menuitem'], h1, h2, p, span")].filter((el) => norm(el.innerText) === needle);
  }
  const visible = matches.filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
  const chosen = visible.length ? visible : matches;
  if (chosen.length !== 1) return { count: chosen.length };
  chosen[0].setAttribute("data-verify-target", "1");
  return { count: 1, name: accName(chosen[0]), role: implicitRole(chosen[0]) };
}`;

async function locateWebdriver(rt, spec) {
  const result = await wd(rt, "POST", `/session/${rt.sessionId}/execute/sync`, {
    script: `return (${FIND_SCRIPT})(arguments[0])`,
    args: [spec],
  });
  const info = result.value;
  if (!info || info.count !== 1) {
    throw new Error(`expected 1 visible match for ${JSON.stringify(spec)}, found ${info?.count ?? 0}`);
  }
  const el = await wd(rt, "POST", `/session/${rt.sessionId}/element`, {
    using: "css selector",
    value: "[data-verify-target='1']",
  });
  const elementId = el.value?.[W3C_ELEMENT] || el.value?.ELEMENT;
  if (!elementId) throw new Error(`element id missing: ${JSON.stringify(el).slice(0, 300)}`);
  return { elementId, info };
}

function playwrightLocator(page, spec) {
  let locator;
  if (spec.testid) locator = page.getByTestId(spec.testid);
  else if (spec.id) locator = page.locator(`[id=${JSON.stringify(spec.id)}]`);
  else if (spec.label) locator = page.getByLabel(spec.label, { exact: true });
  else if (spec.attr) {
    const eq = spec.attr.indexOf("=");
    const key = spec.attr.slice(0, eq);
    const value = spec.attr.slice(eq + 1);
    locator = page.locator(`[${key}=${JSON.stringify(value)}]`);
  } else if (spec.role) locator = page.getByRole(spec.role, spec.name ? { name: spec.name, exact: !!spec.exact } : undefined);
  else if (spec.text) locator = page.getByText(spec.text, { exact: true });
  else throw new Error("missing target. Use --testid, --label, --role/--name, --attr, --id, or --text");
  return locator;
}

async function locatePlaywright(rt, spec) {
  const locator = playwrightLocator(rt.page, spec);
  const count = await locator.count();
  if (count !== 1) throw new Error(`expected 1 match for ${JSON.stringify(spec)}, found ${count}`);
  return { locator };
}

function specFrom(body) {
  return {
    testid: body.testid,
    label: body.label,
    role: body.role,
    name: body.name,
    exact: !!body.exact,
    id: body.id,
    attr: body.attr,
    text: body.text,
  };
}

async function doClick(rt, body) {
  const spec = specFrom(body);
  const button = body.button === "right" ? "right" : "left";
  if (rt.page) {
    const { locator } = await locatePlaywright(rt, spec);
    await locator.click({ button, timeout: Number(body.timeout || 10_000) });
    return { ok: true };
  }
  const { elementId } = await locateWebdriver(rt, spec);
  if (button === "right") {
    await wd(rt, "POST", `/session/${rt.sessionId}/actions`, {
      actions: [
        {
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", duration: 0, origin: { [W3C_ELEMENT]: elementId }, x: 1, y: 1 },
            { type: "pointerDown", button: 2 },
            { type: "pointerUp", button: 2 },
          ],
        },
      ],
    });
    await wd(rt, "DELETE", `/session/${rt.sessionId}/actions`);
  } else {
    await wd(rt, "POST", `/session/${rt.sessionId}/element/${elementId}/click`, {});
  }
  return { ok: true };
}

async function doHover(rt, body) {
  const spec = specFrom(body);
  if (rt.page) {
    const { locator } = await locatePlaywright(rt, spec);
    await locator.hover({ timeout: Number(body.timeout || 10_000) });
    return { ok: true };
  }
  const { elementId } = await locateWebdriver(rt, spec);
  await wd(rt, "POST", `/session/${rt.sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", duration: 0, origin: { [W3C_ELEMENT]: elementId }, x: 2, y: 2 }],
      },
    ],
  });
  await wd(rt, "DELETE", `/session/${rt.sessionId}/actions`);
  return { ok: true };
}

async function doFill(rt, body) {
  const spec = specFrom(body);
  const value = body.value ?? "";
  if (rt.page) {
    const { locator } = await locatePlaywright(rt, spec);
    await locator.fill(String(value), { timeout: Number(body.timeout || 10_000) });
    return { ok: true, value };
  }
  const { elementId } = await locateWebdriver(rt, spec);
  await wd(rt, "POST", `/session/${rt.sessionId}/element/${elementId}/clear`, {});
  await wd(rt, "POST", `/session/${rt.sessionId}/element/${elementId}/value`, {
    text: String(value),
    value: [...String(value)],
  });
  return { ok: true, value };
}

const WD_KEYS = {
  Enter: "\uE007",
  Escape: "\uE00C",
  Tab: "\uE004",
  Backspace: "\uE003",
  ArrowUp: "\uE013",
  ArrowDown: "\uE015",
  ArrowLeft: "\uE012",
  ArrowRight: "\uE014",
};

async function doPress(rt, body) {
  const spec = specFrom(body);
  const key = body.key || "Enter";
  if (rt.page) {
    const { locator } = await locatePlaywright(rt, spec);
    await locator.press(key, { timeout: Number(body.timeout || 10_000) });
    return { ok: true };
  }
  const { elementId } = await locateWebdriver(rt, spec);
  await wd(rt, "POST", `/session/${rt.sessionId}/element/${elementId}/click`, {});
  await sendKey(rt, key);
  return { ok: true };
}

async function sendKey(rt, combo) {
  const parts = String(combo).split("+");
  const key = parts.pop();
  const mods = parts.map((part) => {
    const name = part.toLowerCase();
    if (name === "control" || name === "ctrl") return "\uE009";
    if (name === "shift") return "\uE008";
    if (name === "alt") return "\uE00A";
    if (name === "meta" || name === "cmd") return "\uE03D";
    throw new Error(`unknown modifier ${part}`);
  });
  const value = WD_KEYS[key] || key;
  const actions = [];
  for (const mod of mods) actions.push({ type: "keyDown", value: mod });
  actions.push({ type: "keyDown", value });
  actions.push({ type: "keyUp", value });
  for (const mod of [...mods].reverse()) actions.push({ type: "keyUp", value: mod });
  await wd(rt, "POST", `/session/${rt.sessionId}/actions`, {
    actions: [{ type: "key", id: "keyboard", actions }],
  });
  await wd(rt, "DELETE", `/session/${rt.sessionId}/actions`);
}

async function doKey(rt, body) {
  const key = body.key;
  if (!key) throw new Error("browser key needs --key");
  if (rt.page) {
    await rt.page.keyboard.press(key);
    return { ok: true };
  }
  await sendKey(rt, key);
  return { ok: true };
}

async function doWait(rt, body) {
  const timeout = Number(body.timeout || 15_000);
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeout) {
    try {
      if (body.text) {
        const hay = await pageText(rt);
        last = hay.slice(0, 180);
        if (hay.includes(body.text)) return { ok: true };
      } else if (body.role === "heading" && body.name) {
        await waitForHeading(rt, body.name, 800);
        return { ok: true };
      } else {
        if (rt.page) await locatePlaywright(rt, specFrom(body));
        else await locateWebdriver(rt, specFrom(body));
        return { ok: true };
      }
    } catch (err) {
      last = String(err.message || err).slice(0, 300);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${JSON.stringify(specFrom(body))} text=${body.text || ""}. Last: ${last}`);
}

async function pageText(rt) {
  if (rt.page) return rt.page.locator("body").innerText();
  return evalInPage(rt, () => document.body.innerText);
}

function evidencePath(rt, out) {
  if (!out) throw new Error("missing --out");
  const resolved = path.resolve(rt.evidenceDir, out);
  const root = path.resolve(rt.evidenceDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`--out must stay inside ${rt.evidenceDir}`);
  }
  if (resolved.startsWith(path.resolve(rt.runtimeDir) + path.sep)) {
    throw new Error("evidence must not be written into the runtime directory; cleanup deletes it");
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function doScreenshot(rt, body) {
  const out = evidencePath(rt, body.out);
  await capturePage(rt, out);
  const extra = {};
  if (process.platform === "linux" && rt.surface === "desktop") {
    const windowOut = out.replace(/(\.[^.]+)?$/, "-window.png");
    try {
      grabZooWindow(windowOut);
      extra.window = windowOut;
    } catch (err) {
      extra.windowError = String(err.message || err);
    }
  }
  return { ok: true, path: out, ...extra };
}

async function doSnapshot(rt, body) {
  const out = evidencePath(rt, body.out);
  let text = "";
  if (rt.page?.locator) {
    try {
      text = await rt.page.locator("body").ariaSnapshot();
    } catch {
      text = await rt.page.locator("body").innerText();
    }
  } else {
    text = await evalInPage(rt, () => {
      const lines = [];
      for (const el of document.querySelectorAll("h1, h2, button, [role='radio'], [role='status'], input, [role='menuitem']")) {
        const name = el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || "";
        if (!name.trim()) continue;
        lines.push(`${el.tagName} ${el.getAttribute("role") || ""} ${name.trim().replace(/\s+/g, " ").slice(0, 160)}`);
      }
      return lines.join("\n");
    });
  }
  fs.writeFileSync(out, typeof text === "string" ? text : JSON.stringify(text, null, 2));
  return { ok: true, path: out };
}

function settingsFile(rt) {
  return path.join(rt.dataDir, "settings.json");
}

function assertNoSecrets(text) {
  if (/accessToken|refresh_token|oauth:|mock-access-|mock-refresh-/i.test(text)) {
    throw new Error("Refusing to copy settings that look like they contain a token.");
  }
}

async function doSideEffect(rt) {
  if (rt.surface === "browser" || rt.drive === "browser-stand-in") {
    const raw = await evalInPage(rt, () => localStorage.getItem("zoochattr.settings"));
    if (!raw) throw new Error("browser stand-in has no zoochattr.settings in localStorage. The Tauri settings.json was not written.");
    assertNoSecrets(raw);
    const out = path.join(rt.evidenceDir, "local-storage-settings.json");
    fs.writeFileSync(out, raw);
    const parsed = JSON.parse(raw);
    return {
      ok: true,
      store: "localStorage",
      note: "Stand-in only. The desktop app writes settings.json in ZOOCHATTR_DATA_DIR instead.",
      path: out,
      channels: parsed.channels,
      skin: parsed.skin,
    };
  }
  const file = settingsFile(rt);
  if (!fs.existsSync(file)) {
    throw new Error(`settings.json is not in ${rt.dataDir} yet. A fresh window does not write it until a preference changes.`);
  }
  const raw = fs.readFileSync(file, "utf8");
  assertNoSecrets(raw);
  const out = path.join(rt.evidenceDir, "settings.json");
  fs.writeFileSync(out, raw);
  const parsed = JSON.parse(raw);
  const chatDir = path.join(rt.dataDir, "chat");
  const chatFiles = fs.existsSync(chatDir) ? fs.readdirSync(chatDir) : [];
  return { ok: true, store: "settings.json", path: out, dataDir: rt.dataDir, channels: parsed.channels, skin: parsed.skin, readOnly: parsed.readOnly, chatFiles };
}

async function doDoctor(rt) {
  const problems = [];
  for (const [name, pid] of Object.entries(rt.pids)) {
    if (!alive(pid)) problems.push(`${name} pid ${pid} is not running`);
  }
  let mockUp = false;
  try {
    await waitPort(17423, 1000);
    mockUp = true;
  } catch {
    problems.push("mock HTTP port 17423 is not accepting connections");
  }
  let viteStatus = null;
  try {
    const res = await fetch(rt.url, { signal: AbortSignal.timeout(2000) });
    viteStatus = res.status;
  } catch (err) {
    problems.push(`dev server ${rt.url} did not answer: ${err.message}`);
  }
  let heading = "";
  try {
    heading = String(await pageText(rt)).includes("Nothing in the zoo yet")
      ? "Nothing in the zoo yet"
      : (await pageText(rt)).split("\n").slice(0, 4).join(" | ").slice(0, 240);
  } catch (err) {
    problems.push(`could not read the page: ${err.message}`);
  }
  let windowInfo = null;
  if (process.platform === "linux" && rt.surface === "desktop") {
    windowInfo = xWindowId();
    if (!windowInfo) problems.push(`no on-screen window titled "${VERIFY_WINDOW_TITLE}" wider than 400px`);
  }
  const ours = ourPidSet(rt);
  const otherZoo = zooProcesses().filter((proc) => !ours.has(proc.pid));
  const guardPath = path.join(rt.dataDir, "verify-guard.txt");
  let guard = null;
  if (rt.surface === "desktop") {
    if (!fs.existsSync(guardPath)) problems.push("verify-guard.txt is missing from the data dir");
    else {
      guard = fs.readFileSync(guardPath, "utf8");
      fs.writeFileSync(path.join(rt.evidenceDir, "verify-guard.txt"), guard);
      try {
        assertVerifyGuard(guard);
      } catch (err) {
        problems.push(err.message);
      }
    }
  }
  const network = await githubTouch(rt);
  fs.writeFileSync(path.join(rt.evidenceDir, "network-github.json"), JSON.stringify(network, null, 2));
  if (network.contacted) problems.push(`a verify process connected to GitHub: ${JSON.stringify(network.matches)}`);
  const settings = fs.existsSync(settingsFile(rt));
  const report = {
    ok: problems.length === 0 && rt.ready,
    worthDriving: problems.length === 0 && rt.ready,
    surface: rt.surface,
    drive: rt.drive,
    platform: process.platform,
    version: version(),
    dataDir: rt.dataDir,
    url: rt.url,
    heading,
    settingsJson: settings,
    mockUp,
    viteStatus,
    window: windowInfo,
    pids: rt.pids,
    otherZoo,
    touchedOtherZoo: false,
    verifyGuard: guard,
    network,
    problems,
    standIn: rt.drive === "browser-stand-in",
  };
  fs.writeFileSync(path.join(rt.evidenceDir, "doctor.json"), JSON.stringify(report, null, 2));
  return report;
}

async function shutdown(rt) {
  logLine(rt, "shutdown");
  if (rt.sessionId) {
    try {
      await wd(rt, "DELETE", `/session/${rt.sessionId}`, undefined, 10_000);
    } catch (err) {
      logLine(rt, `session delete: ${err.message}`);
    }
  }
  if (rt.browser) {
    try {
      await rt.browser.close();
    } catch {
      // already closed
    }
  }
  for (const name of ["tauri", "tauri-driver", "vite", "compile", "mock"]) {
    killPidTree(rt.pids[name]);
  }
  killPidTree(process.pid === rt.daemonPid ? null : rt.daemonPid);
  // Give WebKit a moment to drop the window before the caller removes the runtime dir.
  await new Promise((r) => setTimeout(r, 400));
}

async function handle(rt, body) {
  if (!rt.ready && body.cmd !== "shutdown" && body.cmd !== "doctor") {
    throw new Error("instance is not ready");
  }
  switch (body.cmd) {
    case "doctor":
      return doDoctor(rt);
    case "click":
      return doClick(rt, body);
    case "hover":
      return doHover(rt, body);
    case "fill":
      return doFill(rt, body);
    case "press":
      return doPress(rt, body);
    case "key":
      return doKey(rt, body);
    case "wait":
      return doWait(rt, body);
    case "screenshot":
      return doScreenshot(rt, body);
    case "snapshot":
      return doSnapshot(rt, body);
    case "side-effect":
      return doSideEffect(rt);
    case "shutdown":
      await shutdown(rt);
      return { ok: true };
    default:
      throw new Error(`unknown command ${body.cmd}`);
  }
}

async function callDaemon(cmd, extra = {}) {
  const pointer = readPointer();
  if (!pointer?.daemonPort || !alive(pointer.daemonPid)) {
    throw new Error("No live verification instance. Run launch first.");
  }
  const res = await fetch(`http://127.0.0.1:${pointer.daemonPort}/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, ...extra }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `command ${cmd} failed`);
  }
  return json;
}

async function launch() {
  const existing = readPointer();
  if (existing && alive(existing.daemonPid)) {
    throw new Error(`A verification instance is already running (pid ${existing.daemonPid}, evidence ${existing.evidenceDir}). Run cleanup before launching another.`);
  }
  if (existing?.runtimeDir && fs.existsSync(existing.runtimeDir)) {
    removeRuntime(existing.runtimeDir);
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "daemon"], {
    cwd: REPO,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const start = Date.now();
  while (Date.now() - start < 360_000) {
    await new Promise((r) => setTimeout(r, 500));
    const pointer = readPointer();
    if (!pointer || pointer.daemonPid !== child.pid) continue;
    if (pointer.ready) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...pointer }, null, 2)}\n`);
      return;
    }
    if (pointer.error) {
      throw new Error(pointer.error);
    }
    if (!alive(child.pid)) {
      const errorFile = path.join(pointer.evidenceDir || "", "launch-error.txt");
      const detail = fs.existsSync(errorFile) ? fs.readFileSync(errorFile, "utf8") : "daemon exited";
      throw new Error(detail);
    }
  }
  throw new Error("launch timed out after 240s. See verification-evidence for launch.txt.");
}

async function cleanup() {
  const pointer = readPointer();
  if (!pointer) {
    process.stdout.write("nothing to clean up\n");
    return;
  }
  if (alive(pointer.daemonPid) && pointer.daemonPort) {
    try {
      await fetch(`http://127.0.0.1:${pointer.daemonPort}/cmd`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd: "shutdown" }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      killPidTree(pointer.daemonPid);
    }
  } else if (pointer.daemonPid) {
    killPidTree(pointer.daemonPid);
  }
  const start = Date.now();
  while (pointer.daemonPid && alive(pointer.daemonPid) && Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (pointer.daemonPid && alive(pointer.daemonPid)) {
    try {
      process.kill(pointer.daemonPid, "SIGKILL");
    } catch {
      // already gone
    }
    for (const child of descendants(pointer.daemonPid)) {
      try {
        process.kill(child, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  let removedRuntime = null;
  let deleteError = null;
  if (pointer.runtimeDir && fs.existsSync(pointer.runtimeDir)) {
    try {
      removeRuntime(pointer.runtimeDir);
      removedRuntime = pointer.runtimeDir;
    } catch (err) {
      deleteError = String(err.message || err);
    }
  }
  if (fs.existsSync(POINTER)) fs.rmSync(POINTER);
  if (fs.existsSync(POINTER_DIR) && fs.readdirSync(POINTER_DIR).length === 0) fs.rmdirSync(POINTER_DIR);
  const evidence = pointer.evidenceDir;
  process.stdout.write(`${JSON.stringify({ ok: deleteError == null, removedRuntime, deleteError, evidenceKept: evidence, evidenceStillThere: evidence ? fs.existsSync(evidence) : false }, null, 2)}\n`);
  if (deleteError) process.exitCode = 1;
}

function flagsToBody(flags) {
  return {
    testid: flags.testid,
    label: flags.label,
    role: flags.role,
    name: flags.name,
    exact: flags.exact === true || flags.exact === "true",
    id: flags.id,
    attr: flags.attr,
    text: flags.text,
    value: flags.value,
    key: flags.key,
    button: flags.button,
    timeout: flags.timeout,
    out: flags.out,
  };
}

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  try {
    if (command === "daemon") {
      await runDaemon();
      return;
    }
    if (command === "launch") {
      await launch();
      return;
    }
    if (command === "doctor") {
      const report = await callDaemon("doctor");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.worthDriving) process.exitCode = 1;
      return;
    }
    if (command === "cleanup") {
      await cleanup();
      return;
    }
    if (command === "side-effect") {
      const report = await callDaemon("side-effect");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    if (command === "browser") {
      const flags = parseFlags(rest);
      const body = flagsToBody(flags);
      let cmd = sub;
      if (sub === "wait" && flags.text && !flags.role && !flags.testid && !flags.label) body.text = flags.text;
      if (sub === "screenshot" || sub === "snapshot") {
        if (!body.out) throw new Error(`${sub} needs --out relative to the evidence directory`);
      }
      const report = await callDaemon(cmd, body);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    process.stderr.write(
      "Usage: verify.mjs launch | doctor | cleanup | side-effect | browser click|hover|fill|press|key|wait|screenshot|snapshot [flags]\n",
    );
    process.exitCode = 2;
  } catch (err) {
    process.stderr.write(`${err?.stack || err}\n`);
    process.exitCode = 1;
  }
}

function assertVerifyGuard(text) {
  const lines = String(text).split(/\r?\n/);
  if (!lines.includes("credential_service=ZooChattr-verify")) {
    throw new Error("verify-guard.txt is not using the ZooChattr-verify credential service");
  }
  if (!lines.includes("credential_target_session=twitch-session.ZooChattr-verify")) {
    throw new Error("verify-guard.txt is not using twitch-session.ZooChattr-verify");
  }
  if (lines.includes("credential_service=ZooChattr") || lines.includes("credential_target_session=twitch-session.ZooChattr")) {
    throw new Error("verify-guard.txt names the owner's credential target");
  }
  if (!lines.includes("startup_shortcut=skipped") || !lines.includes("updates=skipped")) {
    throw new Error("verify-guard.txt did not skip the Startup shortcut and update checks");
  }
}

function ourPidSet(rt) {
  const ids = new Set();
  const add = (pid) => {
    if (!pid || ids.has(pid)) return;
    ids.add(pid);
    for (const child of descendants(pid)) ids.add(child);
  };
  add(rt.daemonPid);
  for (const pid of Object.values(rt.pids ?? {})) add(pid);
  return ids;
}

function zooProcesses() {
  if (process.platform === "win32") {
    try {
      const out = execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" });
      const found = [];
      for (const line of out.split(/\r?\n/)) {
        const match = /^"([^"]+)","(\d+)"/.exec(line);
        if (!match) continue;
        if (match[1].toLowerCase() === "zoochattr.exe") found.push({ pid: Number(match[2]), exe: match[1] });
      }
      return found;
    } catch {
      return [];
    }
  }
  if (!fs.existsSync("/proc")) return [];
  const found = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let raw = "";
    try {
      raw = fs.readFileSync(`/proc/${entry}/cmdline`).toString("utf8");
    } catch {
      continue;
    }
    const exe = raw.split("\0")[0] || "";
    const base = path.basename(exe).toLowerCase();
    if (base === "zoochattr" || base === "zoochattr.exe") found.push({ pid: Number(entry), exe });
  }
  return found;
}

function hexIPv4(hex) {
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return null;
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff].join(".");
}

function socketInodes(pid) {
  const inodes = new Set();
  const dir = `/proc/${pid}/fd`;
  if (!fs.existsSync(dir)) return inodes;
  for (const fd of fs.readdirSync(dir)) {
    try {
      const target = fs.readlinkSync(path.join(dir, fd));
      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (match) inodes.add(match[1]);
    } catch {
      // unreadable fd
    }
  }
  return inodes;
}

function tcpRemotes(inodes) {
  const remotes = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const inode = parts[9];
      if (!inodes.has(inode)) continue;
      const [addr, portHex] = (parts[2] || "").split(":");
      const port = Number.parseInt(portHex, 16);
      if (file.endsWith("tcp6")) {
        remotes.push({ inode, remote: addr, port });
      } else {
        remotes.push({ inode, remote: hexIPv4(addr), port });
      }
    }
  }
  return remotes;
}

function networkReport(extra) {
  const remotes = extra.remotes ?? [];
  return {
    contacted: extra.contacted,
    evidence: extra.evidence,
    github: extra.github ?? [],
    remotes,
    remote_count: remotes.length,
    matches: extra.matches ?? [],
    ...(extra.note ? { note: extra.note } : {}),
  };
}

async function githubTouch(rt) {
  // /proc/<pid>/fd plus /proc/net/tcp is how Linux ties a socket to a process.
  // Windows has no /proc, so an empty list would look like "no GitHub" even after a real request.
  if (process.platform !== "linux") {
    return networkReport({
      contacted: null,
      evidence: false,
      remotes: [],
      note: "Not evidence on Windows: socket ownership is read from /proc, which Windows does not have.",
    });
  }
  const pids = [...ourPidSet(rt)];
  const inodes = new Set();
  for (const pid of pids) for (const inode of socketInodes(pid)) inodes.add(inode);
  const remotes = tcpRemotes(inodes);
  let github = [];
  try {
    github = [...new Set([...(await dns.resolve4("api.github.com")), ...(await dns.resolve4("github.com"))])];
  } catch (err) {
    return networkReport({
      contacted: null,
      evidence: false,
      github,
      remotes,
      note: `could not resolve GitHub: ${err.message}`,
    });
  }
  const matches = remotes.filter((row) => row.remote && github.includes(row.remote));
  return networkReport({ contacted: matches.length > 0, evidence: true, github, remotes, matches });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}
