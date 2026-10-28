# Updates

ZooChattr checks GitHub for a newer portable build on launch and every few hours when "Check for updates automatically" is on. About & data has "Check now". Install downloads a portable zip only after the app checks that it is a release of this repository and that its SHA-256 matches the published `.sha256` file. Install keeps the data folder.

## Sub-features

- `update-check` runs Check now and shows the result.
- `update-auto` saves the automatic-check switch.
- `update-install` stays disabled until a newer build is actually offered, and is not pressed during verification.

## How to get to it (user POV)

- Gear → About & data.
- Choose "Check now" (`data-testid=check-updates`).
- If a newer build is offered, "Install update" (`data-testid=install-update`) becomes available. Do not choose it while verifying.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor. This check talks to GitHub. The mock does not stand in for it. Offline, the check fails in the UI and the journey fails with that message. Do not stub GitHub.

- **Open.** Settings → "About & data". The version text matches `package.json` (0.6.0 on this branch unless the file changed). Screenshot `--out updates/about.png`.
- **Check.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid check-updates`. Wait until the button is no longer busy. The result text is either that this copy is current or that a newer version exists, or an error if GitHub could not be reached. Screenshot `--out updates/result.png`. Record the sentence. A network error is a failed check, not a pass.
- **Do not install.** If "Install update" is enabled, leave it unclicked. Installing replaces the exe and restarts the app, which kills the verification window.

## Gotchas

- `install-update` is disabled when the page is not running inside Tauri (`isTauri` is false on the browser stand-in). A disabled Install button on the stand-in does not prove the hash check.
- Automatic checks also run at startup. A toast about an update can appear without using Check now. The recipe still has to press Check now.
- The hash check is inside the install path. Verification must not download a release to "see if the hash works" unless that is the explicit journey, and it must not point the installer at a different repository.
