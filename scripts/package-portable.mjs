// Collects the built ZooChattr executable into release/ZooChattr-portable/ (and a zip when a zip tool exists).
// Run after `tauri build --no-bundle` (npm run build:portable does both).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const target = path.join(root, "src-tauri", "target");

const candidates = [
  path.join(target, "release", "zoochattr.exe"),
  path.join(target, "x86_64-pc-windows-msvc", "release", "zoochattr.exe"),
  path.join(target, "release", "zoochattr"),
];
const built = candidates
  .filter((file) => fs.existsSync(file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!built) {
  console.error("No ZooChattr build found. Run `npm run tauri build -- --no-bundle` first.");
  process.exit(1);
}

const isExe = built.endsWith(".exe");
const outDir = path.join(root, "release", "ZooChattr-portable");
fs.mkdirSync(outDir, { recursive: true });
const exeName = isExe ? "ZooChattr.exe" : "ZooChattr";
fs.copyFileSync(built, path.join(outDir, exeName));
if (!isExe) fs.chmodSync(path.join(outDir, exeName), 0o755);

fs.writeFileSync(
  path.join(outDir, "README.txt"),
  [
    `ZooChattr ${version} (portable)`,
    "",
    `Double-click ${exeName} to start. Nothing gets installed.`,
    "",
    "- Settings and the webview cache live in the ZooChattr-data folder created next to the exe.",
    "  Copy the whole folder to take your channel list with you.",
    "- Your Twitch login is kept in Windows Credential Manager (entry \"ZooChattr\"), not in this folder.",
    "  Use Log out in the app to remove it.",
    "- Windows SmartScreen may warn because the exe isn't code-signed: More info > Run anyway.",
    "- Needs the Microsoft Edge WebView2 runtime, which ships with Windows 11.",
    "",
  ].join("\r\n"),
);

const zipPath = path.join(root, "release", `ZooChattr-portable-${version}.zip`);
fs.rmSync(zipPath, { force: true });
try {
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${outDir}' -DestinationPath '${zipPath}'`,
    ]);
  } else {
    execFileSync("zip", ["-qr", zipPath, "ZooChattr-portable"], { cwd: path.join(root, "release") });
  }
  console.log(`Packed ${path.relative(root, zipPath)}`);
} catch {
  console.log("No zip tool found; skipping the zip.");
}

const sizeMb = (fs.statSync(path.join(outDir, exeName)).size / 1048576).toFixed(1);
console.log(`Portable ZooChattr ready in ${path.relative(root, outDir)} (${exeName}, ${sizeMb} MB)`);
