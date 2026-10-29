# Changelog

## 0.7.2

### Changed

- The − and ⋯ buttons in a pane header sit together at the pane's edge, with no gap between them.

## 0.7.1

### Changed

- The bottom bar is slimmer and even: the view switch, message box, emote button, Send, connection dot and Settings gear are all the same height, and the message box fills all the space between the view switch and the gear.
- No line of text above "chat in #channel" any more. You still confirm before sending to a new channel; the reason is in the button's tooltip.

## 0.7.0

### Changed

- No more top bar: nothing sits above the chats. One bar at the bottom holds the view switch (1 · 2 · 3 · 4 · 6 · 9) on the left, the message box in the middle and the connection dot and Settings gear on the right. On a narrow window the message box gets its own row.
- Each pane picks its own channel. A pane header has two buttons: − empties the pane (it keeps its place, also after a restart) and ⋯ opens a channel picker inside the pane: search, your Twitch follows under Following, channels you added under Added, live dots and unread counts. Arrow keys and Enter work; Esc or Back closes it.
- Channels are added only in the picker: type a name, #name or twitch.tv link and pick "Add". Ctrl+K still jumps between open channels.
- The channel menu (Open alone, Emote status, Reload emotes, Open on twitch.tv, Move up/down, Leave) is on right-click of a pane header or a picker row, or the Menu key in the picker.
- Ctrl+Shift+H hides the bottom bar.

### Fixed

- After dragging a pane header onto another pane, the next click is no longer ignored.

## 0.6.0

### Changed

- New look. Channel avatars across the top replace the sidebar, with Twitch follows, live dots and viewer counts. A view switch (1 · 2 · 3 · 4 · 6 · 9) sits next to the gear. Panes are flush with a slim header and an underline on the focused pane.
- One shared message box at the bottom for the focused pane, centered with a max width. A new emote panel sits next to Send.
- Settings open in the window, with search and 7 sections.
- 13 themes, plus Auto, which follows Windows live. The saved theme loads before the first paint.
- New teal gecko icon for the taskbar, window, tray and exe. A small connection dot replaces the Wi-Fi icon.
- The pane menu keeps Open alone, Open on twitch.tv and Hide from grid. Emote status is on the channel's right-click menu in the top strip.
- Emotes (7TV, BTTV, FFZ) refresh about once an hour, so new or renamed emotes show without a restart.

### Added

- Chat missed while ZooChattr was closed fills in from the history server. The address comes with the app; the read token is pasted once in Settings → Account & history.

### Fixed

- The newest chat message is no longer cut off when a pane gets shorter.
- The same chat line can no longer show up twice.
- The login tab no longer steals focus.
- Updates install only releases from this repo whose SHA-256 fingerprint matches.

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
