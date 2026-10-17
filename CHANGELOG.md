# Changelog

## 0.5.0

### Fixed

- Enter while a Tab completion is open accepts the match and leaves the trailing space. The message is not sent until the next Enter. The same path covers emote names and @mentions. Clicking a suggestion accepts it the same way.

### Added

- Our own spell checker in the message box. Edge's checker stays off. It underlines after you stop typing, skips emotes, names, commands, URLs, digits, and short ALL-CAPS words, and offers suggestions, Add to dictionary, and Ignore for this session. The dictionary is English (US), stored for offline use, and the language list can grow. Spell check, the word list, and the language are in Settings and in backups.
- Grid and Single switch from the header or Ctrl+G. Single opens the chat that was hovered or last focused, and the grid order is kept. Double-click a box header to focus it. Esc returns to the grid when no menu or completion is open.
- Ctrl+K finds a followed channel. Enter opens it in Single. Alt+Enter, or Put in grid slot, drops it into the active grid box. Ctrl+1 through Ctrl+9 jump to a slot. Ctrl+Tab and Ctrl+Shift+Tab move between chats in Single. Alt+Shift+Left and Alt+Shift+Right move a box. Shortcuts are in the header tooltips and in Settings.
- Drag a box header onto another box to swap them. Drag a sidebar channel onto a box to replace it, or onto empty grid space to add it. In Single, dragging a sidebar channel switches to that chat. The box menu has Swap with. Changes are announced for screen readers.
- The grid picks columns from the window size, with boxes at least 300 by 260 CSS pixels. Narrow windows stack. Very narrow windows suggest Single. Portrait windows prefer rows. Ultrawide windows keep a box from stretching past about 900 pixels. The grid can hold up to 9 chats. The setting defaults to 4, so older settings files stay valid.
- Mock Twitch can send about 50 messages a second per channel (`POST /__heavy?rate=50` or `MOCK_HEAVY`). `SOAK_MOCK=1` runs the soak against that mock, and Chrome is found automatically on Windows.

### Changed

- The sidebar collapses below about 900 pixels wide.
- Tailwind, the Tailwind Vite plugin, `tw-animate-css`, and the shadcn package are devDependencies. They are used while building the CSS, not inside the running app.
- `Cargo.toml` version matches `package.json`.

### Removed

- Move earlier and Move later in a grid box's menu, after drag and Alt+Shift+Arrow could reorder boxes.
- Unused interface files `badge.tsx`, `select.tsx`, `separator.tsx`, `toggle.tsx`, `toggle-group.tsx`, and `tooltip.tsx`.
- The `next-themes` dependency. Nothing imported it.
- `export` on helpers that were only used in their own file (spell ranking data, grid-slot sanitizers, color hashing, history boundary prefix, fuzzy score, and similar).
