# Per channel

Per-channel overrides turn features off for one channel without changing the global switches. The features are 7TV, BetterTTV, FrankerFaceZ, overlay emotes, Tab completion, the emote menu, hover preview, highlight words, and deleted-message display.

## Sub-features

- `override-add` picks a joined channel.
- `override-off` unticks one feature for that channel only.
- `override-global` leaves the global switch on.

## How to get to it (user POV)

- Gear → Per channel.
- Choose the channel in "Channel for feature overrides".
- Untick the feature you do not want there.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor and `geckotown` joined. The override list only offers channels you have added.

- **Open.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid settings-gear` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Per channel"`.
- **Add the channel.** Choose the quick-add button `#geckotown` (or fill "Channel for feature overrides" with `geckotown` and choose "Add"). A block `data-testid=channel-override-geckotown` is shown. The page starts with "No per-channel overrides yet."
- **Turn off the emote menu there.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --id override-geckotown-emotePicker`. The switch is the "Emote menu" row inside that block. `side-effect` shows `channelOverrides.geckotown` containing `"emotePicker"`, and top-level `emotePicker` still true.
- **See it.** Close Settings, unlock the message box for `#geckotown`. The smiley button (`emote-picker-button`) is absent in that channel and the global Emotes switch is still on. Screenshot `--out per-channel/no-picker.png`.

## Gotchas

- An empty channel list means you have not joined anyone. The section tells you to add a channel. Do not invent an override for a channel that is not in `channels`.
- Feature ids in `settings.json` are the stored ids (`emotePicker`, and the other ids in the override checklist), not the on-screen sentences. Read the array and the missing button. Both must agree.
- A global off switch hides the feature everywhere. This recipe fails if `emotePicker` becomes false.
