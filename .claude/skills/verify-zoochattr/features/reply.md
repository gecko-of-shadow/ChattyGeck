# Reply

Hover a chat line and choose Reply to answer that message. The message box shows "Replying to @name" and the start of their text. Esc or the X clears it. Clicking the name still only inserts an `@mention`; it does not start a reply.

## Sub-features

- `reply-start` shows the reply banner for a line.
- `reply-cancel` clears it with the X or Esc.
- `reply-send` sends the reply after login.
- `reply-name` inserts an `@mention` and does not open the banner.

## How to get to it (user POV)

- Join a channel so a line is visible.
- Hover the line. Choose "Reply to <name>".
- Type a reply and send, or press Esc, or choose "Cancel reply".

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor, `geckotown` joined, welcome line visible ("Reply to TokayTom" is in the row).
- Sending the reply needs mock login and an unlocked message box ([composer.md](./composer.md)). Starting the banner does not.

- **Hover.** The Reply button is invisible and ignores clicks until the row is hovered (`opacity-0` and `pointer-events-none`). Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser hover --role button --name "Reply to TokayTom"` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Reply to TokayTom"`.
- **Banner.** Wait for `--testid reply-banner`. The text includes `Replying to` and `@TokayTom`. Screenshot `--out reply/banner.png`.
- **Cancel.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Cancel reply"`. The banner is gone. Esc does the same when the banner is up, and that Esc does not also leave single view.
- **Send.** Log in, unlock the box, start the reply again, fill `Message #geckotown` with `waving back`, press Enter. The log shows your line. Screenshot `--out reply/sent.png`. The mock must show the line on the read connection the same way as a normal send.

## Gotchas

- A click on Reply without a hover does not count if the button still has `pointer-events-none`. If the click reports success but no banner appears, the hover did not land on the row. Fail the step.
- Clicking the name button "TokayTom" inserts `@TokayTom` into the box after login. The banner stays down. That is a different control.
- Reply is per channel. Switching channels clears the banner for the box you left.
- Do not mark reply sent because the banner was visible. The log line is the send proof.
