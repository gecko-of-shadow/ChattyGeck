# History server

A history server is your own chat logger. ZooChattr asks it at startup for lines it missed while closed. Settings stores the address. The read token is stored with the Twitch login, not in `settings.json` and not in a backup. The mock speaks the same read API on `http://127.0.0.1:17423` with read token `mock-read-token`.

## Sub-features

- `history-save` saves an address and a token from Account & history.
- `history-status` says connected, unauthorized, or that the channel is not recorded.
- `history-token-hidden` never prints the token back into the form or into `settings.json`.
- `history-off` clears the address to turn the built-in server off.

## How to get to it (user POV)

- Gear → Account & history → History server.
- Paste the address and the read token. Choose Save.
- The line under the form says whether it connected.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor. Join `geckotown` first so the status can name a channel.
- Use the mock address. Do not point this at a real logger unless you intend to use a real read token, and do not copy that token into the evidence directory.

- **Open.** Settings, "Account & history". The address field's label is "History server address". The token field's label is "History server read token".
- **Save the mock.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "History server address" --value "http://127.0.0.1:17423"` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "History server read token" --value "mock-read-token"` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid history-server-save`.
- **Status.** Wait for test id `history-server-status`. On a fresh mock the text is "Connected, but the logger doesn't record #geckotown" (the mock has not been given lines through a user action). Screenshot `--out history/status.png`. That sentence is the pass for "the server answered". It is not a pass for "missed chat was filled in".
- **Token not in settings.** `side-effect` shows `"historyServer": "http://127.0.0.1:17423"` and does not contain `mock-read-token`. The token field's placeholder becomes "Saved. Paste a new token to replace it".
- **Bad token.** Fill the token `nope` and Save. The status says the server turned down that token. Put `mock-read-token` back if later recipes need it.

## Gotchas

- Filling missed chat needs lines the logger actually stored, then a restart. The mock starts with nothing stored. Do not POST `/__history` to seed lines; that is a test hook. Stop at the "doesn't record" status.
- `http://` is accepted only for `127.0.0.1` and `localhost`. Any other host must be `https`. A bad address does not save.
- The README in `logger/` says the fields live under Settings → Window. The window puts them under Account & history. Follow the window.
- A built-in `VITE_HISTORY_SERVER` is not set in `.env.mock`. The address field starts empty. Releases may show a built-in address; clearing it and saving turns that off (`historyServerOff`).
