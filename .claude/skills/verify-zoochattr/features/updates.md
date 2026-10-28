# Updates

ZooChattr checks GitHub for a newer portable build on launch and every few hours when "Check for updates automatically" is on. About & data has "Check now". Install downloads a portable zip only after the app checks that it is a release of this repository and that its SHA-256 matches the published `.sha256` file. Install keeps the data folder.

## Sub-features

- `update-check` runs Check now and shows the result.
- `update-auto` saves the automatic-check switch.
- `update-install` is not in the page until GitHub reports a newer build. Its label is `Install` plus the tag (for example `Install v0.6.1`), test id `install-update`. It is not pressed during verification.

## How to get to it (user POV)

- Gear → About & data.
- Choose "Check now" (`data-testid=check-updates`).
- A newer build adds a button whose name is `Install` plus the release tag (`data-testid=install-update`). There is no button named "Install update". Do not choose it. On the browser stand-in that button is disabled because install only runs inside Tauri.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor, `ZOOCHATTR_VERIFY=1` (what `launch` sets). Verify mode does not contact GitHub. A normal launch outside this harness still checks GitHub when auto-check is on.

- **Open.** Settings → "About & data". The version text matches `package.json` (0.6.0 on this branch unless the file changed). Screenshot `--out updates/about.png`.
- **Check.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid check-updates`. The status text is "Update checks are off in verify mode. GitHub was not contacted." There is no `install-update` button. Screenshot `--out updates/result.png`. On Linux, `network-github.json` has `"evidence": true` and `"contacted": false`, with `remotes` and `remote_count` for the sockets this run owned. A status that says GitHub could not be reached means the guard failed. On Windows, `githubTouch` sets `"evidence": false` and `"contacted": null`. That file does not prove GitHub was skipped: Windows has no `/proc/<pid>/fd` or `/proc/net/tcp`, so the harness cannot tell which process owns a connection. An empty `remotes` list there would look like a pass even after a real request. Use the status text and `verify-guard.txt` (`updates=skipped`) on Windows.
- **Do not install.** Installing replaces the exe. Verify mode refuses the download in the shell as well (`Updates are off in verify mode. Nothing was downloaded.`).

## Gotchas

- Outside verify mode, `install-update` is absent until a newer release exists. On the browser stand-in it is disabled (`isTauri` is false) when it does appear. A missing button is not the same as a disabled button named "Install update".
- Automatic checks run at startup only when verify mode is off. In verify mode the timer is not armed. A toast about an update during `launch` means the guard failed.
- The hash check is inside the install path. Verification must not download a release to "see if the hash works" unless that is the explicit journey, and it must not point the installer at a different repository.
