# Backup and reset

About & data can save a JSON backup of preferences, favourites, and the channel list, restore that file, or reset settings to the defaults. The backup never includes the Twitch login or the history-server token.

## Sub-features

- `backup-save` writes a JSON file the user can keep.
- `backup-contents` includes channels and theme and excludes tokens.
- `backup-restore` applies a file the user picks.
- `reset-settings` returns switches and the theme to defaults after a confirm, and keeps the channel list and the login.

## How to get to it (user POV)

- Gear → About & data.
- Choose "Back up". The file dialog saves `zoochattr-settings-<date>.json`.
- Choose "Restore…" and pick a file.
- Choose "Reset…", then "Really reset?" to confirm.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor and `geckotown` joined, so the backup has a channel to prove.
- The file dialog is an OS dialog. This harness cannot click a native save dialog. Do not call a test-only export function.

- **See the actions.** Open Settings → "About & data". The buttons "Back up", "Restore…", and "Reset…" are visible. Screenshot `--out backup/panel.png`.
- **Reset confirm.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-reset`. The button label becomes "Really reset?". Click it again. The toast says settings were reset and that channels and login stay. `side-effect` still lists `geckotown` in `channels`, and `"skin": "crested"`. A theme you had changed is back to Crested gecko. Screenshot `--out backup/reset.png`.
- **Backup file.** Choosing "Back up" opens a native save dialog. If you cannot complete that dialog from the harness, stop and report the dialog as not driven. Do not invent a backup file by copying `settings.json` and calling it the backup. A completed dialog's file must contain `channels` and must not contain `accessToken`.
- **Restore.** "Restore…" opens a native file picker (`accept` json). Same rule: if the picker is not completed by a user action the harness performed, the restore step is not passed.

## Gotchas

- Reset asks twice. One click only arms "Really reset?" and does not change settings.
- Reset keeps `channels` and the login. It does not return the window to "Nothing in the zoo yet". The hint on the row says "Keeps your channels and login."
- Do this after you have copied any `settings.json` you still need. Cleanup deletes the data directory anyway.
- The on-disk `settings.json` is the live file. The backup is a separate download the user names. They are not the same path.
- Login survives reset. `side-effect` still must not contain a token. The status can stay "Connected · geckotester".
