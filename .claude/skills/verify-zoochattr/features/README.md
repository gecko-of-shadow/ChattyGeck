# ZooChattr verification map

This directory is the maintained source for verifying ZooChattr's user-facing behavior. Read [../FEATURE-MAP.md](../FEATURE-MAP.md) and this index, then use one feature file as the recipe.

## Baseline preconditions

- Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs launch` from the repo root so the desktop window opens on an empty data directory.
- Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs doctor` and require `"worthDriving": true`, `"surface": "desktop"`, and `"standIn": false`.
- The heading is `Nothing in the zoo yet` until a recipe adds a channel.
- The mock Twitch from `scripts/mock-twitch.mjs` is the chat, login, emote, and history-server boundary. Real Twitch credentials are not in the repo.
- Never drive a ZooChattr window this launch did not start.
- On Windows, quit any ZooChattr already running before launch. A second launch focuses that copy.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer the accessible names and test ids in the feature file. The command lines are literal.
- The harness is `verify-zoochattr`: `node .claude/skills/verify-zoochattr/scripts/verify.mjs`.
- Screenshot the action and the result under `verification-evidence/<runId>/` with `--out`.
- After a change that should stick, run `side-effect` and read `channels` (and `skin` or `readOnly` when the recipe names them) from the copied `settings.json`.
- Cleanup removes the temp data directory, not the evidence directory.

## Proof and skip reporting

- A heading or a toast alone is not enough when the recipe names a file or a second screen.
- Record the feature file and the entry point you used next to the screenshots.
- If a step cannot be reached, stop. Write the command you ran and the unmet precondition. Do not mark that step passed via another route.
- `VERIFY_SURFACE=browser` is a stand-in. Say that it did not check the Tauri window.

## Features

- [Add a channel](./add-channel.md)
- [Channel strip](./channel-strip.md)
- [Grid and single chat](./grid-and-single.md)
- [Reading chat](./reading-chat.md)
- [Message box](./composer.md)
- [Twitch login](./twitch-login.md)
- [Emote menu](./emote-menu.md)
- [Tab completion](./tab-completion.md)
- [Emote sources and status](./emote-settings.md)
- [Appearance](./appearance.md)
- [Mentions](./mentions.md)
- [Spell check](./spell-check.md)
- [Quick switch](./quick-switch.md)
- [Read only and hide the strip](./read-only-and-hide-ui.md)
- [Per channel](./per-channel.md)
- [Chat history on this PC](./chat-history.md)
- [History server](./history-server.md)
- [Settings search](./settings-search.md)
- [Backup and reset](./backup-and-reset.md)
- [Updates](./updates.md)
- [Window, tray, and startup](./window-and-tray.md)
- [Reply](./reply.md)
