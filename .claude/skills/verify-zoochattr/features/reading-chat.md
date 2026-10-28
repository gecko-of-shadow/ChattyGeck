# Reading chat

Each chat is a log of lines: time, badges, a colored name, and the message. A line that arrives while you are in another chat is unread. Coming back shows "New since you left". Deleted lines stay faded and crossed out unless Settings hides them.

## Sub-features

- `log-line` shows the mock welcome line with a timestamp and the name TokayTom.
- `log-unread` counts lines that arrive while that chat is not the one on screen.
- `log-marker` shows "New since you left" when you return.
- `log-deleted` keeps removed lines readable when "Show deleted messages" is on (the default).

## How to get to it (user POV)

- Join a channel. The lines appear in its pane, or in the single chat after you open it.
- Click another avatar, then click back, to see the "new since you left" marker.
- Settings → Chat & mentions → "Show deleted messages" changes whether a removed line stays visible.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor is healthy and `geckotown` is joined.
- Do not post `/__burst` or `/__say` on the mock. Those are test hooks. The only line the user path receives on join is TokayTom's welcome.

- **See the line.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --text "welcome to #geckotown, grab a warm rock" --timeout 20000`. The snapshot lists a button "TokayTom" and "Reply to TokayTom". The time is at the start of the row (24-hour clock is the default).
- **Connection.** The status text is "Connected · anonymous" until login. A spinner or "Connecting…" that never becomes "Connected" means the mock IRC port was not the one Vite was built to use (`ws://127.0.0.1:17422` from `.env.mock`).
- **Leave and return.** Join `lizardlounge` from the + tile ([add-channel.md](./add-channel.md)). Click the `geckotown` avatar (`browser click --attr data-drag-channel=geckotown`) so that chat is alone, then click `lizardlounge`. The unread journey needs lines to arrive while you are away. The mock does not send more lines unless heavy mode is on, and this recipe must not turn that on through a test route. Stop here and report that "New since you left" was not reached because no further user-visible lines arrived. Do not invent them.
- **Deleted lines.** The default keeps them. Confirm the switch "Show deleted messages" is on in Settings → Chat & mentions. A real deletion is a moderator action the mock does not perform on the welcome line by itself. Report the display toggle's saved value via `side-effect` (`showDeleted: true`) and do not claim a crossed-out row was shown unless a deletion was actually on screen.

## Gotchas

- Names are buttons that insert an `@mention` after you are logged in and the message box is open. Clicking TokayTom while logged out does not send.
- The log's accessible name in the grid is `#geckotown messages` on the scroll area (`data-testid=chat-log-scroll` is shared by every pane; do not use it when more than one pane is mounted).
- "New since you left" is easy to fake with the mock's burst route. That route is not a user action. Leave the step failed when the mock stays quiet.
