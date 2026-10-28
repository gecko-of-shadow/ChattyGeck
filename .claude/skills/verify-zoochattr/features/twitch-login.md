# Twitch login

Login uses Twitch's device code. ZooChattr shows a code, the person approves it at twitch.tv/activate, and the password never goes in the app. Log out revokes the token. A Client ID is required. The mock build has `mock-client-id`. A real build uses `TWITCH_CLIENT_ID` from `.env` or a value pasted in Settings.

## Sub-features

- `login-code` shows a device code and the approve instructions.
- `login-session` becomes `GeckoTester` on the mock, or the real Twitch user when the mock is not used.
- `login-logout` returns to anonymous reading.
- `login-client-id` pastes an override in Settings → Account & history.

## How to get to it (user POV)

- Choose "Log in with Twitch" on the bottom bar, or the same button in Settings → Account & history.
- Choose "Get a login code".
- On the mock, the code approves itself. On real Twitch, open the link and enter the code.
- Log out from Settings → Account & history.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor is healthy. `geckotown` may already be joined; login does not require it.
- This recipe is written for the mock boundary that `launch` starts. If doctor says `standIn`, the session is in `sessionStorage` and is dropped when that Chrome closes. Say so.

- **Start.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Log in with Twitch"` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Get a login code"`.
- **See the code.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --text "GECKO123" --timeout 10000` and screenshot `--out login/code.png`. The dialog says the password never touches the app.
- **Approved.** Wait until the dialog closes and the status text is "Connected · geckotester" (`--timeout 20000`). Screenshot `--out login/in.png`. The bottom of a joined channel is the message box or "chat in #channel", not the anonymous prompt.
- **Where the token lives.** `side-effect` must not contain `accessToken` or `oauth:`. The desktop token is in the OS credential store (Windows Credential Manager, generic credential `twitch-session.ZooChattr`; Linux kernel keyring). Do not dump the keyring into evidence.
- **Log out.** Open Settings, choose the "Account & history" button in the "Settings sections" navigation, choose "Log out", and confirm if asked. The status returns to "Connected · anonymous".

## Gotchas

- If the code is not `GECKO123`, you are on real Twitch. The journey then waits for a person at twitch.tv/activate. Leave it failed. Do not paste a token into the webview.
- No Client ID: the dialog asks for one instead of "Get a login code". Mock mode always has `mock-client-id` from `.env.mock`. An empty `TWITCH_CLIENT_ID` on a non-mock build stops here.
- The mock approves after two polls. That is the mock, not a Twitch approval. Write that in the result.
- "Log in again to see your Twitch follows" is a second login when the saved token lacks `user:read:follows`. The mock's new logins include it.
