---
name: verify-zoochattr
description: "Drive ZooChattr, the Tauri 2 desktop Twitch chat window, the way a user does: launch it, check one feature, and save screenshots and logs. Use when proving a ZooChattr UI change, checking a feature after a patch, or when asked to verify the desktop app."
---

# Verify ZooChattr

ZooChattr is a Windows desktop app (Tauri 2 webview + React). The user touches one main window: a top strip of channel avatars, a grid or a single chat, a message box, and Settings inside that same window. There is no router. A second surface, `npm run dev`, is the same React UI in a browser and does not write `settings.json`. The Cloudflare worker in `logger/` is a separate app; this skill only drives the History server fields inside ZooChattr.

The harness is `verify.mjs` in this folder. It is executable. From the repo root:

```bash
node .claude/skills/verify-zoochattr/scripts/verify.mjs launch
node .claude/skills/verify-zoochattr/scripts/verify.mjs doctor
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --role heading --name "Nothing in the zoo yet"
node .claude/skills/verify-zoochattr/scripts/verify.mjs cleanup
```

On PowerShell the same `node` lines work. Do not start a second instance while one is running.

Read [FEATURE-MAP.md](FEATURE-MAP.md) before picking a feature, then follow that feature's file under [features/](features/README.md).

## Launch

Default surface is the real desktop window (`VERIFY_SURFACE=desktop`). It starts from an empty data directory.

Preconditions on either OS:

- Repo root, dependencies installed (`npm ci`).
- A debug shell already built with `npm run tauri:mock` (not `cargo build`, and not `npm run build:portable`). The binary is `src-tauri/target/debug/zoochattr` (`.exe` on Windows). `tauri dev` compiles it with the dev URL `http://127.0.0.1:17420`. A release binary loads embedded files and will not attach to the mock dev server. If the binary is missing, `launch` runs `npm run tauri:mock` until it exists, then stops that process and continues.
- Ports `17420`, `17422`, `17423` free. Linux also needs `4444` and `4445`. Windows also needs `9222`. If one is taken, launch fails and does not kill the occupant.
- No ZooChattr already running. On Windows the single-instance plugin focuses the existing window, and you would drive the user's real chats. On Linux the plugin is on only when `DBUS_SESSION_BUS_ADDRESS` starts with `unix:`.

What launch starts, in order:

1. `node scripts/mock-twitch.mjs` — IRC `ws://127.0.0.1:17422`, HTTP `http://127.0.0.1:17423`. This is the production boundary stand-in from the README (`.env.mock`): Twitch IRC, device login, Helix, 7TV, BTTV, FFZ, and the history-server read API. It does not replace GitHub update checks.
2. Vite in mock mode.
3. The Tauri window, with `ZOOCHATTR_DATA_DIR` set to a new empty directory under the OS temp dir (`%TEMP%\zoochattr-verify\<runId>\data` on Windows, `/tmp/zoochattr-verify/<runId>/data` on Linux).

Linux desktop (what a proof on Linux actually drives):

- Vite mock mode on `http://127.0.0.1:17420` (the `devUrl` in `src-tauri/tauri.conf.json`).
- `tauri-driver` (`tauri-driver` 2.x on `PATH`, or `TAURI_DRIVER` pointing at it) proxying to `WebKitWebDriver`.
- The harness sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` (a blank window without it, per the README) and `GDK_BACKEND=x11` when that variable is unset.
- `DISPLAY` must already point at an X11 server.

Windows desktop (same `launch` command; not executed on the Linux proof):

- `npm run tauri:mock`, which runs Vite on port 17420 and opens the WebView2 window.
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`.
- Playwright attaches with `connectOverCDP` to that WebView2 page. Do not also open Chrome.

Ready means the window is usable, not merely that a port answers. Launch returns JSON with `"ready": true` only after an `h1` reading **Nothing in the zoo yet** is in the webview. That heading is rendered only after settings have loaded (`BootScreen` shows "Loading your chats…" before that). On Linux, launch also requires an on-screen window titled `ZooChattr` wider than 400px and saves `launch-window.png` plus `launch-page.png` under the evidence directory. `settings.json` is not created yet; the shell may write `window.json` and a `webview/` cache. That is normal.

`VERIFY_SURFACE=browser` is a labeled stand-in: headless Chrome on `http://127.0.0.1:17440` (`npm run dev:mock`'s port) against the same mock. Doctor reports `"drive": "browser-stand-in"`. It does not open the Tauri window, does not write `settings.json`, and stores preferences in that Chrome profile's `localStorage` key `zoochattr.settings`. Use it only when the desktop shell cannot start, and say so in the result. A stand-in pass does not prove tray, single-instance, the credential store, or `settings.json`.

Mock login is not a real Twitch login. The device code is always `GECKO123`, it auto-approves after two polls, and the user is `GeckoTester`. The line `welcome to #geckotown, grab a warm rock` exists only in `scripts/mock-twitch.mjs`. If that line never appears, you are not on the mock.

## Doctor

Run this first whenever something looks wrong. It does not click, type, or save settings.

```bash
node .claude/skills/verify-zoochattr/scripts/verify.mjs doctor
```

Exit code 0 and `"worthDriving": true` means: the processes this launch started are alive, mock port 17423 accepts connections, the dev server returns a status below 500, the page can be read, and (Linux desktop) the ZooChattr window is on screen. It rewrites `doctor.json` in the evidence directory. `"settingsJson": false` is expected before the first preference change. `"standIn": true` means do not claim the desktop shell was checked.

If `worthDriving` is false, stop. Do not point the recipe at a different app to make it pass.

## Drive

Commands go to the webview that launch attached (WebKitWebDriver on Linux, WebView2 CDP on Windows, Playwright on the stand-in). Targets are ARIA names, labels, ids, and `data-*` attributes from this repo. One match is required; two matches is a failure.

```bash
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --role heading --name "Nothing in the zoo yet"
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Channel name or twitch.tv link" --value geckotown
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser press --label "Channel name or twitch.tv link" --key Enter
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-gear
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Close settings"
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid view-1
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --attr data-drag-channel=geckotown --button right
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser hover --role button --name "Reply to TokayTom"
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+Shift+H
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --text "grab a warm rock" --timeout 20000
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser screenshot --out add-channel/result.png
node .claude/skills/verify-zoochattr/scripts/verify.mjs browser snapshot --out add-channel/result.aria.txt
node .claude/skills/verify-zoochattr/scripts/verify.mjs side-effect
```

`--name` matches the accessible name as a substring so a switch labeled "Read only" still matches when its hint is part of the name. `--label` is exact (`aria-label` or the `<label>`). `--timeout` is milliseconds. There is no `eval` and no command that calls Zustand or Tauri `invoke` for you.

Stable handles used across the map:

| What the user sees | Handle |
| --- | --- |
| Empty zoo | heading `Nothing in the zoo yet` |
| Add box | label `Channel name or twitch.tv link`, button `Join channel` |
| Add tile | button `Add a channel`, test id `add-channel-tile` |
| Avatar | attribute `data-drag-channel=<login>` |
| View 1 / 2 / 3 / 4 / 6 / 9 | test id `view-1` … `view-9`, or radio name `4 chats, 2 by 2` |
| Gear | test id `settings-gear`, button `Settings` |
| Settings panel | test id `settings-panel`, dialog name `Settings` |
| Settings section | button inside navigation `Settings sections` |
| Settings search | label `Search settings`, test id `settings-search` |
| Message box | label `Message #<channel>` |
| Confirm send target | test id `channel-switch-unlock`, button `chat in #<channel>` |
| Send | button `Send` (or `Squawk` / `Bloop` / `Trumpet` on animal themes) |
| Connection | test id `connection-status` (`Connected · anonymous` or `Connected · <login>`) |
| Emote menu | button `Emote menu`, test id `emote-picker-button` |
| Quick switch | dialog `Switch channel`, test id `quick-switch` (Ctrl+K) |
| Show the top strip | test id `show-chrome`, button `Show UI` |

`side-effect` copies `settings.json` from the data directory into the evidence directory and prints `channels`. On the stand-in it copies `localStorage` instead and says so. It refuses to write the copy if the text looks like an access token.

## Evidence

Every run writes to `verification-evidence/<runId>/` in the repo. That directory is gitignored. Cleanup does not delete it.

| File | When |
| --- | --- |
| `launch.txt` | harness log, including pids |
| `launch-window.png` | Linux only: the real X11 window at ready |
| `launch-page.png` | webview pixels at ready |
| `doctor.json` | last doctor |
| `run.json` | run id, data dir, drive backend |
| `settings.json` | copy taken by `side-effect` after a real preference change |
| paths passed to `--out` | screenshots and aria snapshots |

On Linux desktop, `browser screenshot` also writes a sibling `*-window.png` grabbed from the X11 window titled `ZooChattr`. The page screenshot and the window grab should show the same screen. A page image with no window grab does not prove the shell was on screen.

Proof standard:

- Use the controls a user uses. Do not set Zustand, call `invoke`, or hit mock routes such as `POST /__burst`, `/__live`, or `/__history` to force a state the UI did not reach.
- Save a shot of the action (text in the box, dialog open) and a shot of the result.
- Check a side effect outside the webview. For the desktop app that is `settings.json` in `ZOOCHATTR_DATA_DIR` (`channels`, `skin`, `readOnly`, …). Chat lines land in `ZooChattr-data/chat/<login>.jsonl` about 30 seconds after they arrive (`HISTORY_FLUSH_MS`), or when the page hides, not on the same tick as the line.
- The mock is the boundary. Confirm it by the scripted welcome line and by `Connected · anonymous` or `Connected · geckotester`. Do not treat a mock login as Twitch having accepted a real token.
- There is no dry-run flag. `VERIFY_SURFACE=browser` still opens a dev server and talks to the mock; it only skips the Tauri shell.

## Cleanup

```bash
node .claude/skills/verify-zoochattr/scripts/verify.mjs cleanup
```

This sends shutdown to the daemon started by `launch`, then signals that pid and its child processes (mock, Vite, `tauri-driver`, WebKitWebDriver, the `zoochattr` binary it spawned). It does not signal by process name. It deletes the temp runtime directory (data dir included) and leaves `verification-evidence/<runId>/` in place. After every failed launch, run cleanup before trying again so ports are free.

Confirm the evidence directory still exists after cleanup before calling the run done.

## Helpers

The only helper is `.claude/skills/verify-zoochattr/scripts/verify.mjs` (shebang `node`, mode `+x`). Invoke it as shown above. `launch` prints JSON with `evidenceDir`, `dataDir`, `drive`, and `daemonPid`. Exit code 1 means the step failed; the reason is on stderr and, for launch, in `verification-evidence/<runId>/launch-error.txt`.

## Keeping the map honest

When a feature's controls move, update that feature file and [FEATURE-MAP.md](FEATURE-MAP.md) in the same change. `/maintain-verification-skill` is the loop for that. Do not mark a journey passed by switching to a shorter path.
