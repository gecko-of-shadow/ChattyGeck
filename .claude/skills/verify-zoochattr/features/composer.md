# Message box

The box at the bottom sends to the focused chat. Until you log in it is replaced by "You're reading anonymously." With "Confirm channel before typing" on (the default), switching chats replaces the box with "chat in #channel" until you press it. Enter sends. Up and down recall what you sent. `/me` sends an action.

## Sub-features

- `composer-locked-out` shows the login prompt while anonymous.
- `composer-confirm` requires "chat in #channel" after a channel change.
- `composer-send` sends a line and shows it in the log.
- `composer-recall` puts the previous sent line back with the up arrow.
- `composer-slash-me` sends a line that starts with `/me`.

## How to get to it (user POV)

- Join a channel. If you are logged out, the bottom bar says to log in.
- Log in ([twitch-login.md](./twitch-login.md)). The box placeholder is "Send to #channel" (or Squawk / Bloop / Trumpet on an animal theme).
- Click another chat. Press the full-width "chat in #channel" button before typing.
- Type and press Enter, or choose Send.

## Driving it with verify-zoochattr

Preconditions:

- Desktop window, `geckotown` joined.
- Sending requires the mock login. If login is not completed, stop at the login prompt and follow [twitch-login.md](./twitch-login.md). Do not skip the confirm-channel step to make send easier; the default setting is on.

- **Logged out.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --role button --name "Log in with Twitch"`. The text "You're reading anonymously" is on screen. There is no textbox "Message #geckotown".
- **After login.** The message box or the confirm button is visible. If you just switched chats, run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --testid channel-switch-unlock` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --testid channel-switch-unlock`. The button's text is `chat in #geckotown`.
- **Type.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Message #geckotown" --value "hello from the zoo"` and screenshot `--out composer/typed.png`. The Send button is enabled.
- **Send.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser press --label "Message #geckotown" --key Enter`. Wait for the text `hello from the zoo` in the log (`--timeout 20000`). Screenshot `--out composer/sent.png`. The status is "Connected · geckotester". The mock echoes the line on the read connection; a "sending…" spinner that never becomes the line means the write connection was rejected.
- **Recall.** Click the message box, run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key ArrowUp`. The box contains `hello from the zoo` again and has not sent a second copy until Enter.

## Gotchas

- Confirm-channel hides the textbox. Filling "Message #geckotown" before the unlock click fails with zero matches. That failure is the feature working.
- Send is disabled while the read connection is down or the box is empty.
- `/me` is still a send. Watch the log for the line, not only an empty box.
- The mock does not echo to the connection that sent. The line you see is the read connection's copy. A NOTICE containing `fail-me` is the mock's rate-limit test hook; do not type `fail-me` to prove send.
- Room-mode chips (emote-only, followers-only, subs-only, slow) show under the box when the room sets them. The mock's ROOMSTATE is all off, so those chips stay hidden. Do not treat a missing chip as a bug on this mock.
