# ZooChattr 0.5.0 handoff

Nothing is committed, tagged, pushed, or published. `main` is still `888a995`. The working copy reports **0.5.0**.

## Follow-up (dead code and the 56 MB)

Removed, after grep showed no callers:

- `saveChatHistory` in `src/lib/platform.ts` (history still goes through `appendChatHistory`)
- `getLaunchAtLogin` in `src/lib/platform.ts` (`setLaunchAtLogin` is what boot calls; the Rust command is still registered)
- `armComposer` in `src/store/ui.ts` (`armedComposer` is still set by `insertIntoComposer`)

Not removed: the emote fetchers in `src/lib/emotes/providers.ts`. `registry.ts` calls them through `globalFetchers` and `channelFetchers`.

Checks: `tsc --noEmit` clean, `npx vitest run` 188 passed, `npm run tauri build -- --no-bundle` succeeded, `npm run e2e:mock` all steps passed on the second run (the first run failed three grid steps; the failure shot was a one-box grid, and the rerun passed including spell check).

Memory: heap snapshots of the 0.4.22 and 0.5.0 mock UIs (`http://127.0.0.1:17441` and `:17440`, same four mock channels). With spell check on, the 0.5.0 heap keeps one nspell dictionary (about 65,000 word arrays, +7 MB JS heap). It is not loaded once per composer. Spell check off matches 0.4.22 (about 34 MB). The squiggle overlay is empty until a word is flagged. `LiveRegion` holds one string. QuickSwitcher stays mounted and closed.

A focused-composer check on the new exe: JS heap 11 → 18 MB, process RAM stayed 674 MB. One dictionary is about 13 MB of V8 heap and 23 MB of Node RSS, not 56 MB of WebView2 working set. Idle RAM, which never loads the dictionary, moved 455 → 483 MB on a repeat with no relevant code change. The 56 MB gap is larger than the dictionary and sits inside that working-set noise.

The dictionary now loads on the first focus of a message box, still one shared `nspell` instance. Same-method remeasure of the new exe (`perf/0.5.0-exe-after.json`), similar chat volume (xqc 237 messages vs 250 before):

| | Before | After |
| --- | ---: | ---: |
| Idle RAM | 455 MB | 483 MB |
| RAM with 4 chats | 589 MB | 613 MB |
| Typing p95 | 32 ms spell on, 24 ms off | 32 ms spell on, 24 ms off |

Startup shortcut was not changed. It still points at the 0.4.0 portable.

## Done earlier this session

1. Installer build finished (`npm run tauri build`, MSVC on PATH via vcvars).
   - `src-tauri/target/release/bundle/msi/ZooChattr_0.5.0_x64_en-US.msi` — 2,945,024 bytes
   - `src-tauri/target/release/bundle/nsis/ZooChattr_0.5.0_x64-setup.exe` — 2,329,215 bytes
   - `src-tauri/target/release/zoochattr.exe` — 5,099,008 bytes
2. `cargo machete` 0.9.2 in `src-tauri`: **no unused crates**. Nothing removed.
3. 15-minute GC soak passed on same-view heap. Log: `soak/15min-gc/soak.jsonl`. See below.
4. Fair exe comparison is in `perf/888a995-exe.json` and `perf/0.5.0-exe.json`. Do not use `perf/888a995-after.json` (headless Chrome).
5. Portable zip and the NSIS install were smoked. See below.

Parts 0–2 were already done before this session (tsc, 188 vitest, build, e2e:mock). This session did not change application source.

## Soak

15 minutes, 4 mock channels, ~50 msgs/s, `gc()` before each sample (`--js-flags=--expose-gc` confirmed: a probe saw `gc` and the heap drop).

- Every channel’s message list stayed at 400.
- Grid DOM stayed about 7,640–7,670 nodes and 480 chat rows. Single (minutes 6–10) stayed about 2,750 nodes and 150 rows.
- Read stayed connected. About 175k lines received. Nine resource 404s in minute 1, then none.
- Minute 5 (grid, 53.0 MB) to minute 15 (grid, 55.9 MB) is +5.5%. That window includes the grid → single → grid flip. Focused minutes 6–10: 47.9 → 48.2 MB (+0.6%). Grid after the return, minutes 11–15: 55.8 → 55.9 MB (+0.2%). Early-grid average 53.2 MB vs late-grid average 55.2 MB (+3.8%). No climbing leak. No code change.

## Perf (real exe + WebView2)

0.4.22 exe built in a detached worktree at `C:\Users\Bran\Meow\ZooChattr-0.4.22` (commit `888a995`), `src-tauri/target/release/zoochattr.exe`, 4,902,400 bytes.

Same method for both: isolated `ZOOCHATTR_DATA_DIR`, 3 warmups then median of 5 for cold start, one 60s CPU/RAM window, in-page event timing for typing, in-page click/key to DOM change for toggle and swap. Channels for the 4-chat run: xqc, summit1g, pokimane, shroud. Message volume matched (about 135 rows; xqc ~230 messages, the other three quiet).

Windows did not leave the test window as the foreground window (`SetForegroundWindow` returned false on every launch, including with thread attach). The window was shown. Both exes were measured that way.

| | 0.4.22 | 0.5.0 |
| --- | ---: | ---: |
| Cold start to chat box | 1001 ms | 1021 ms |
| Idle RAM / CPU (one core) | 456 MB / 32% | 455 MB / 35% |
| RAM / CPU with 4 chats | 533 MB / 55% | 589 MB / 59% |
| Typing p95 | 24 ms | 32 ms spell on, 24 ms spell off |
| View toggle p95 | 41 ms (radio) | 40 ms (radio and Ctrl+G) |
| Swap p95 | 11 ms (menu “Move later”) | 7 ms (Alt+Shift+Arrow) |
| Exe size | 4,902,400 | 5,099,008 (+192 KB) |

Dictionary files `public/spell/en-US.aff` + `en-US.dic` are 554,848 bytes. Exe growth is smaller than that.

Ratings (1–10), in the final report.

## Smoke

Fresh unzip: `C:\Users\Bran\AppData\Local\Temp\ZooChattr-smoke-portable\ZooChattr-portable\ZooChattr.exe`.

NSIS silent install: `C:\Users\Bran\AppData\Local\Temp\ZooChattrInstall050\zoochattr.exe` (not Program Files, not `%LOCALAPPDATA%\ZooChattr`).

Both: launch, join xqc / summit1g / pokimane / shroud, Ctrl+G back to 4 boxes, two squiggles on “recieve” and “teh”, Tab+Enter on “Kap” left `KappaCool ` in the box and did not send. Logs: `perf/smoke-portable.json`, `perf/smoke-installer.json`.

The Windows login already in Credential Manager was used. It was not cleared. No chat was sent.

## Startup shortcut

A killed measurement rewrote `Startup\ZooChattr.lnk` to the 0.4.22 worktree exe. It was put back to `C:\Users\Bran\Downloads\ZooChattr-portable-0.4.0\ZooChattr-portable\ZooChattr.exe`, the only ZooChattr.exe that existed when the shortcut was created (2026-10-15). Confirm that target.

A byte backup of the restored shortcut is `C:\Users\Bran\AppData\Local\Temp\zoo-measure\ZooChattr.lnk.original`.

## Still your decision

- Proposed, not changed: unused fetchers were checked and are in use; `.github/workflows/release.yml` deleting older GitHub releases (not touched). `saveChatHistory`, `getLaunchAtLogin`, and `armComposer` are removed.
- `cargo machete` has nothing to remove. depcheck still flags `@fontsource-variable/geist`, `jetbrains-mono`, `dictionary-en`, `shadcn`, `tailwindcss`, and `tw-animate-css`. Those are CSS imports or the spell-file source. Leave them.
- 4-chat RAM is about 11% higher (56 MB) with the same chat volume. Soak heap is flat. Worth a look only if that 56 MB matters.
- Do not commit until asked.

## Worktree

`C:\Users\Bran\Meow\ZooChattr-0.4.22` is a detached worktree at `888a995`. The main checkout was not switched.
