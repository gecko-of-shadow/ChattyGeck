# Tab completion

Tab finishes an emote or a chatter name in the message box. The first Tab fills the best match. Tab again, or the arrow keys, cycles. Shift+Tab goes back. A word that starts with `@` completes people who have spoken. Matches also appear in a strip above the box.

## Sub-features

- `tab-emote` completes `Kap` to an emote name without sending.
- `tab-cycle` moves to the next match.
- `tab-user` completes `@tok` to a person who has spoken in that chat.

## How to get to it (user POV)

- Focus the message box of a joined channel you are logged into.
- Type at least two letters and press Tab.
- Press Tab again to cycle, or click a row in the strip ("Suggestions").

## Driving it with verify-zoochattr

Preconditions:

- Desktop, mock login, message box for `#geckotown` unlocked ([composer.md](./composer.md)).
- TokayTom has spoken the welcome line, so `@` completion has that name.
- The mock emote set includes `Kappa`.

- **Emote.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Message #geckotown" --value Kap` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser press --label "Message #geckotown" --key Tab`. The box text becomes an emote name that starts with `Kap` (the mock's `Kappa`) followed by a space. Screenshot `--out tab/emote.png`. The log does not contain a newly sent line.
- **Suggestions.** The strip `data-testid=tab-complete` is visible while matches are open. Its accessible name is "Suggestions".
- **Name.** Fill `@to` and press Tab. The box contains `@tokaytom` or `@TokayTom`. Screenshot `--out tab/name.png`.

## Gotchas

- Tab completion needs two characters (`MIN_TYPED`). One letter does not open the strip.
- Enter while the strip is open sends the line. Use Tab, not Enter, for this recipe.
- The feature is off when Settings → Emotes turns off "Tab to complete emotes and names", or when the per-channel override turns it off for this channel. The strip then never appears.
- Names come from people who have spoken in that channel. The mock's only speaker on join is TokayTom, plus you after you send.
