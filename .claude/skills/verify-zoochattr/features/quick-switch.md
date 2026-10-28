# Quick switch

Ctrl+K opens a small dialog to jump to a channel or add one. Type to filter channels already in the app. Enter opens the highlighted channel alone. Alt+Enter puts it in a grid pane. If nothing matches, the typed name can be added.

## Sub-features

- `switch-open` opens and closes the dialog.
- `switch-filter` narrows the list to channels you already joined.
- `switch-add` adds a new name from the same box.
- `switch-grid` uses Alt+Enter to pin into the grid.

## How to get to it (user POV)

- Press Ctrl+K anywhere the view hotkeys are active (including while Settings is open; a real dialog or menu blocks other hotkeys, but Ctrl+K still toggles this one).
- Type in "Channel search".
- Press Enter, or Alt+Enter, or click a row. Press Esc to close without changing anything.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor and `geckotown` joined.
- The dialog's test id is `quick-switch-dialog`. The input's test id is `quick-switch` and its label is "Channel search".

- **Open.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+k`. Wait for `--role dialog --name "Switch channel"`. Screenshot `--out switch/open.png`.
- **Filter.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Channel search" --value gecko`. The list shows `geckotown`.
- **Open alone.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser press --label "Channel search" --key Enter`. The dialog closes and view 1 shows `#geckotown` (`data-testid=single-header`).
- **Add.** Press Ctrl+K again. Fill `lizardlounge`. If it is not already joined, the row "Add #lizardlounge" (`data-testid=quick-switch-add`) is shown. Activate it with Enter. `side-effect` lists both channels.
- **Close without a change.** Press Ctrl+K, then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Escape`. The dialog is gone and `channels` is unchanged.

## Gotchas

- Ctrl+K in a normal browser is the location bar. In the Tauri webview the page handler runs. On the browser stand-in, confirm the dialog opened; if Chrome stole the key, the stand-in did not exercise the shortcut and the click path is not a substitute you should silently call a pass. Report it.
- Alt+Enter is the grid drop. Plain Enter opens single view.
- Fuzzy match is on channels already added. A brand-new name is the add row, not a filter hit.
