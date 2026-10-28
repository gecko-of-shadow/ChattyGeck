# Read only and hide the strip

Read only hides the message box so you cannot chat by accident. Ctrl+Shift+R toggles it, and so does Settings → Chat & mentions. Ctrl+Shift+H hides the top strip. A "Show UI" button brings it back. While the strip is hidden, that floating bar also has a Read only button.

## Sub-features

- `read-only-on` hides the message box and saves `readOnly`.
- `read-only-off` brings the box back.
- `chrome-hide` hides the top strip and shows "Show UI".
- `chrome-show` restores the strip.

## How to get to it (user POV)

- Press Ctrl+Shift+R, or use the Read only switch in Settings.
- Press Ctrl+Shift+H. Choose "Show UI" or press Ctrl+Shift+H again.
- The shortcuts are listed in Settings → Window & startup.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor, `geckotown` joined, mock login so a message box exists to hide. Logged out, the bottom bar is already the login prompt; hiding it is a weaker check. Log in first.

- **Read only.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+Shift+R`. The live region text includes "Read only on: message box hidden". The textbox "Message #geckotown" is gone. `side-effect` shows `"readOnly": true`. Screenshot `--out chrome/read-only.png`.
- **Off.** Press Ctrl+Shift+R again. The message box or the "chat in #geckotown" confirm button is back. `readOnly` is false.
- **Hide the strip.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+Shift+H`. Wait for `--testid show-chrome`. The gear and the avatars are gone. Screenshot `--out chrome/hidden.png`. `side-effect` shows `"chromeHidden": true`.
- **Show.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid show-chrome`. Test id `top-bar` is back.

## Gotchas

- Ctrl+Shift+R is Chrome's hard reload. The app calls preventDefault. If the page reloads to the boot screen, the key never reached the app and the check failed.
- "Show UI" and the floating Read only button exist only while the strip is hidden (`data-testid=show-chrome` and `data-testid=read-only-toggle`).
- Esc does not leave read only.
- Settings can stay open while the strip hides; the panel is not part of the strip.
