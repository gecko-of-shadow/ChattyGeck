# Spell check

With the message box focused, misspelled words get a wavy underline. Emotes, names, commands, and links are left alone. The dictionary loads the first time the box is focused. Right-click a misspelling for suggestions, "Add to dictionary", or ignore.

## Sub-features

- `spell-underline` marks `recieve` in the box.
- `spell-ignore-emote` does not mark `Kappa`.
- `spell-menu` offers suggestions from a right-click.
- `spell-off` removes underlines when the setting is off.

## How to get to it (user POV)

- Log in and focus the message box. Spell check is on by default.
- Type a misspelling. The wavy line is under that word.
- Right-click the word for the menu (`data-testid=spell-menu`).
- Settings → Chat & mentions → Spell check turns it off or changes the personal word list.

## Driving it with verify-zoochattr

Preconditions:

- Desktop, mock login, message box unlocked for `#geckotown`.
- Do not send the misspelling. This recipe only looks at the box.

- **Focus and type.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Message #geckotown" --value recieve`. Click the box if the underline waits for focus: `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --label "Message #geckotown"`.
- **Underline.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --testid spell-miss --timeout 20000`. Screenshot `--out spell/recieve.png`. The log has no new line.
- **Emote.** Fill `Kappa`. There is no `spell-miss` for that word.
- **Off.** Settings → Chat & mentions, turn off the switch "Spell check" (`id` `pref-spell` is on the switch). Fill `recieve` again. `spell-miss` is absent. `side-effect` shows `"spellCheck": false`.

## Gotchas

- The underline is not the browser's spellcheck. The input sets `spellCheck` false on purpose so Edge's checker stays off. Judge `data-testid=spell-miss`, not the browser's red line.
- The dictionary is large and loads on first focus. A wait under a second can be too short the first time.
- "Add to dictionary" appends to `spellDictionary` in `settings.json`. Ignore does not.
- Spell check does not run while logged out, because the message box is not there.
