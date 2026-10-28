# Grid and single chat

The 1·2·3·4·6·9 control sets how many chats are on screen. 1 is one chat. The others are grids: 2 side by side, 3 in a row, 2 by 2, 3 by 2, and 3 by 3. Ctrl+G flips between one chat and the grid. Esc returns to the grid. Pane headers can be dragged to swap; double-click a header to open that chat alone.

## Sub-features

- `view-switch` changes the layout from the top-right control.
- `view-hotkey` uses Ctrl+G and Esc.
- `pane-menu` uses the ··· menu on a pane: Open alone, Open on twitch.tv, Hide from grid.
- `pane-focus` uses Ctrl+1 through Ctrl+9 to pick the pane the message box talks to.

## How to get to it (user POV)

- Choose a number on the top right. 4 is the default and starts selected.
- Press Ctrl+G, or click an avatar, or double-click a pane header, to read one chat.
- Press Esc to come back to the grid.
- Choose ··· on a pane header.

## Driving it with verify-zoochattr

Preconditions:

- `geckotown` is joined and on the grid ([add-channel.md](./add-channel.md)).
- Settings is closed. The Settings page has a second copy of the number switch without `view-*` test ids.

- **See the default.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --testid view-4`. The radio "4 chats, 2 by 2" is checked. `#geckotown` is one pane.
- **One chat.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid view-1`. The header `data-testid=single-header` is shown and the grid of four panes is gone. Screenshot `--out grid/single.png`.
- **Back with the hotkey.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+g` or click `view-4`. If Ctrl+G leaves you in single view, the focused channel was already showing; press it again or click `view-4`. The four-pane layout returns.
- **Esc.** From view 1, run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Escape`. The grid returns. Esc does nothing to the grid when Settings or a menu is open; those close first.
- **Pane menu.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Options for #geckotown"` then wait for menuitem "Hide from grid". Choose it only when you mean to unpin. "Open on twitch.tv" leaves the app.

## Gotchas

- `view-4` is the top switch only. Settings → Window & startup has another "Grid slots" group. Close Settings before asserting a single `view-4`.
- Ctrl+G from the grid opens the focused or hovered channel, which is `geckotown` after the add-channel recipe. If no channel is pinned, it still switches mode and the single view is empty.
- Dragging headers to swap is pointer motion. This harness can hover and click; it does not drag. Report swap-by-drag as not driven, and do not claim it passed because the ··· menu exists. The menu does not contain a swap item.
- Ctrl+1 focuses a pinned pane. With one pinned channel, Ctrl+2 has no pane to focus.
