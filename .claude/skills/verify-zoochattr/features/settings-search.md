# Settings search

The gear opens Settings over the right side of the window. Chat keeps running behind it. A search box filters every section. Seven sections are listed on the left with a count: Appearance, Chat & mentions, Emotes, Per channel, Window & startup, Account & history, About & data. Esc or the X closes the panel and puts focus back on the gear.

## Sub-features

- `settings-open` opens from the gear.
- `settings-section` shows one section.
- `settings-search-hit` keeps rows whose label, hint, or choice matches every word.
- `settings-search-miss` says nothing matches.
- `settings-close` closes with Esc or "Close settings".

## How to get to it (user POV)

- Choose the gear at the top right, or the tray item Settings… on Windows.
- Type in "Search settings".
- Choose a section in the list "Settings sections".
- Press Esc or the X.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor. No channel is required.

- **Open.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-gear`. Wait for `--testid settings-panel`. The heading text "Settings" is in the panel. The gear's `aria-expanded` is true. Screenshot `--out settings/open.png`.
- **Section.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Window & startup"`. The keyboard shortcut list includes "Ctrl+G" and "Ctrl+Shift+H".
- **Search hit.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Search settings" --value "mention sound"`. "Mention sound" is still on screen. A section with no match shows "no match" next to its name.
- **Search miss.** Fill `zzzz-not-a-setting`. Wait for `--testid settings-search-empty`. Screenshot `--out settings/empty.png`.
- **Close.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Close settings"`. `settings-panel` is gone.

## Gotchas

- The panel is `role=dialog` but not modal. Hotkeys such as Ctrl+K still run. Esc closes a menu inside Settings before it closes Settings.
- Search does not change values. A filtered-out switch keeps its saved state. Prove a change with `side-effect`, not with "the row was visible".
- "1×" matches a search for `1x` because the multiply sign is folded. That is intentional.
- The tray's Settings item is not reachable from this harness's click commands. On Windows, opening Settings from the tray is a separate check. Do not claim it from the gear click.
