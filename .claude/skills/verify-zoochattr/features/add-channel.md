# Add a channel

Add a channel lets a person type a Twitch name, a `#name`, or a twitch.tv link and see that chat. A bad name is rejected and is not joined.

## Sub-features

- `add-empty` joins from the empty-zoo box.
- `add-tile` joins another channel from the + tile.
- `add-reject` rejects spaces and a VOD url.
- `add-persist` keeps the channel in `settings.json` after it is joined.

## How to get to it (user POV)

- On a fresh window, type in the box labeled "Channel name or twitch.tv link" and press Enter, or choose "Join channel".
- After at least one channel exists, choose "Add a channel" (the + circle) and use the same box.
- Ctrl+K can add a name too; that path is [quick-switch.md](./quick-switch.md).

## Driving it with verify-zoochattr

Preconditions:

- Doctor reports the desktop window, an empty data dir, and the heading "Nothing in the zoo yet".
- The mock is the chat boundary. The welcome line below is not sent by real Twitch.

- **Open the empty box.** It is already on screen. Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --role heading --name "Nothing in the zoo yet"`. The textbox "Channel name or twitch.tv link" is visible.
- **Type a channel.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --label "Channel name or twitch.tv link" --value geckotown` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser screenshot --out add-channel/typed.png`. The shot shows `geckotown` in the box and the heading still up.
- **Join.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser press --label "Channel name or twitch.tv link" --key Enter`. The heading is gone. A region named `#geckotown chat` is on the 4-up grid. Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --text "welcome to #geckotown, grab a warm rock" --timeout 20000`.
- **Result.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser screenshot --out add-channel/result.png` and `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser snapshot --out add-channel/result.aria.txt`. The window shows `#geckotown`, TokayTom's welcome line, "Connected · anonymous", and "You're reading anonymously. Log in with Twitch to chat back."
- **Persist.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs side-effect`. The copied `settings.json` has `"channels": ["geckotown"]` and `"gridChannels": ["geckotown"]`.
- **Reject a bad name.** Choose "Add a channel", fill `bad name!`, press Enter. The text "doesn't look like a Twitch channel" appears. Fill `https://www.twitch.tv/videos/1234567890` and press Enter. The same rejection appears, and `side-effect` still does not list `videos`.

## Gotchas

- The welcome sentence is hardcoded in the mock. If it never shows, the window is not on the mock, or the join did not reach IRC. Do not post to the mock's test routes to invent the line.
- Enter submits the form. A second Enter is not required.
- Default view is 4. One channel fills one pane; the other three say "Empty pane. Press + on a channel in the top strip to fill it."
- `settings.json` does not exist until this join (or another preference change). A missing file before the join is expected.
- The browser stand-in stores the same JSON in `localStorage`, not in `settings.json`. Doctor must say `standIn` is false before this counts as the desktop app.
