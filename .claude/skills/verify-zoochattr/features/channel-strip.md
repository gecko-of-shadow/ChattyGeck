# Channel strip

The top strip is the row of round channel pictures. Channels you added come first. Channels you follow on Twitch come after, newest follow first, and are not joined until you add them. A green dot means live. A badge counts mentions or unread lines. A ring means the chat is on screen. The +/− badge pins a channel on the grid or takes it off.

## Sub-features

- `strip-avatar` shows the channel and opens it alone when clicked.
- `strip-pin` shows or hides the channel on the grid.
- `strip-menu` right-click (or the Menu key) offers Open alone, Show in grid, Emote status, Reload emotes, Open on twitch.tv, Move left, Move right, and Leave.
- `strip-follows` shows follow-only avatars after login, labeled as chat not open.
- `strip-live` shows a live dot only when the mock (or Twitch) says the channel is live.

## How to get to it (user POV)

- Look at the top of the window after a channel is added. The gecko logo is on the left, then the avatars, then the connection dot, the view switch, and the gear.
- Click an avatar to read that chat alone.
- Click the small + or − on the avatar.
- Right-click an avatar, or focus it and press the Menu key or Shift+F10.

## Driving it with verify-zoochattr

Preconditions:

- [add-channel.md](./add-channel.md) has joined `geckotown`. Doctor still says desktop.
- Live dots and follows need a logged-in session. Without login, follows are absent and live viewer counts stay unknown. Do not call the mock's `/__live` route; the mock already marks `geckotown` live, but ZooChattr only reads that after login.

- **Avatar is on the strip.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --attr data-drag-channel=geckotown`. Its accessible name contains `#geckotown` and `in the grid`.
- **Unpin.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Hide #geckotown from the grid"`. The pane leaves the grid. The avatar name no longer says `in the grid`. `side-effect` shows `gridChannels` without `geckotown` and `channels` still containing it.
- **Pin again.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --role button --name "Show #geckotown in the grid"`. The pane returns.
- **Menu.** Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser click --attr data-drag-channel=geckotown --button right` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser wait --role menuitem --name "Open on twitch.tv"`. Press Escape. Do not choose "Open on twitch.tv" (it opens a browser). Do not choose "Leave #geckotown" unless the recipe is testing leave; after Leave, the avatar and the `channels` entry are gone.
- **Follows.** Complete [twitch-login.md](./twitch-login.md). An avatar `data-drag-channel=chameleoncafe` appears whose name contains `followed on Twitch, chat not open`. `side-effect` must not list `chameleoncafe` in `channels`. `geckotown` shows a live dot (`data-live-dot` inside `[data-strip-channel=geckotown]`) and the name contains `live`.

## Gotchas

- The +/− control's name changes between "Show #… in the grid" and "Hide #… from the grid". Use the name that matches the current pin.
- Two "Hide #geckotown from the grid" buttons can exist (avatar badge and pane header). If the command reports more than one match, target the avatar badge with `--attr data-drag-channel=geckotown` only after closing menus, or hide from the pane header with the button inside `#geckotown chat`.
- Clicking the avatar opens view 1. That is [grid-and-single.md](./grid-and-single.md), not a failed pin.
- Follows without `user:read:follows` show a "Log in again to see your Twitch follows" chip (`data-testid=follows-login`). The mock grants that scope. A real token from before the scope was added will not list follows until the person logs in again.
