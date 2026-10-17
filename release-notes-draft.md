# ZooChattr 0.5.0

Draft only. Do not tag, push, or publish until this is approved.

## Fixed

Enter during Tab completion no longer sends the message. The first Enter accepts the emote or @mention, including the trailing space. The next Enter sends it. Clicking a suggestion does the same.

## Added

- Spell check in the message box, with underlines, suggestions, a personal dictionary, and Ignore for this session. English (US) ships offline. Edge's spell checker stays off.
- Ctrl+G switches Grid and Single and keeps the grid order. Double-click a header to focus a chat. Esc goes back to the grid.
- Ctrl+K finds a channel. Ctrl+1 through Ctrl+9 and Ctrl+Tab move between chats.
- Drag a box header to swap. Drag a sidebar channel onto a box to replace it. Alt+Shift+Arrow moves a box. The grid can hold up to 9 chats, and the setting still defaults to 4.

## Changed

The sidebar tucks away below about 900 pixels. Layout follows the window: narrow windows stack, portrait windows use more rows, and ultrawide windows keep boxes from stretching past about 900 pixels.

## Removed

- Move earlier / Move later, replaced by drag, Swap with, and Alt+Shift+Arrow.
- Unused `badge`, `select`, `separator`, `toggle`, `toggle-group`, and `tooltip` components.
- The unused `next-themes` package.

## Build

Portable build: `release/ZooChattr-portable/ZooChattr.exe` is 5,099,008 bytes. The zip is `release/ZooChattr-portable-0.5.0.zip` (2,644,856 bytes). Compared with the 0.4.0 portable exe (4,906,496 bytes) that is about 188KB more, inside the allowed dictionary growth.

The portable exe is the normal Twitch build, so it was not logged into the mock. A mock login smoke needs a build pointed at the mock.

`cargo machete` could not be installed from this shell (`link.exe` was not on PATH for that install). The Tauri release build itself did link.

## Checks

- `npx tsc --noEmit`, `npx vitest run` (188 tests), `npm run build`, and `npm run e2e:mock` passed after the view-switching fix.
- Layout screenshots: `test-results/layout/`.
- Performance numbers are in `perf/888a995-after.json`. They are headless Chrome against the mock UI, not the Rust process and WebView2. In-page Ctrl+G over 40 toggles: p95 33ms. A later stress run of 500 toggles and 500 Alt+Shift+Arrow moves: toggle p95 39.5ms, move p95 8.5ms, no page errors.
- 45-minute soak with 4 mock chats at about 50 messages/second: `soak/45min/soak.jsonl` and `soak/45min/soak.csv`. Heap stayed between 48 and 57MB as the view flipped between Single and Grid. Grid samples stayed near 54–57MB from minute 15 through minute 45 (55.6MB then 55.5MB). DOM stayed near 7,660 in Grid and 2,750 in Single. The message window stayed capped at 400 lines per channel. Nine resource 404s were logged in the first minute, then none. No rising heap or DOM trend.
