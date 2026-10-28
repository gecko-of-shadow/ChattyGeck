# ZooChattr feature map

User-facing behavior of the ZooChattr desktop window, and how to check each one with the `verify-zoochattr` harness. Launch and doctor first ([SKILL.md](SKILL.md)). Then open the feature file. One proof run does not cover this list; each file is a separate journey. If a precondition is missing, stop and record the failure in that file's Gotchas. Do not shorten the journey so it passes.

The index with shared preconditions is [features/README.md](features/README.md).

| Feature | How to check it | File |
| --- | --- | --- |
| Add a channel | From an empty window, type `geckotown` in "Channel name or twitch.tv link" and press Enter. The grid shows TokayTom's welcome line, and `settings.json` lists `geckotown`. | [features/add-channel.md](features/add-channel.md) |
| Channel strip | After a channel is joined, the round avatar, live dot, unread count, follow-only avatars, and the right-click menu behave as a user moving channels on and off the grid. | [features/channel-strip.md](features/channel-strip.md) |
| Grid and single chat | The 1·2·3·4·6·9 switch, Ctrl+G, pane headers, and Esc change how many chats are on screen. | [features/grid-and-single.md](features/grid-and-single.md) |
| Reading chat | Joined chats show timestamps, names, the mock welcome line, and "New since you left" when you leave and come back. | [features/reading-chat.md](features/reading-chat.md) |
| Message box | Anonymous viewers see "Log in with Twitch". After mock login, confirm the channel, send a line, and see it in the log. | [features/composer.md](features/composer.md) |
| Twitch login | Device login shows code `GECKO123` on the mock and then "Connected · geckotester". A real Client ID without the mock waits for twitch.tv/activate and does not pass by itself. | [features/twitch-login.md](features/twitch-login.md) |
| Emote menu | The smiley button opens search, tabs, and a favourite. | [features/emote-menu.md](features/emote-menu.md) |
| Tab completion | Typing `Kap` and pressing Tab inserts a mock emote name in the message box and does not send. | [features/tab-completion.md](features/tab-completion.md) |
| Emote sources and status | Settings → Emotes switches sources, size, and motion. The avatar menu's Emote status names the provider result. | [features/emote-settings.md](features/emote-settings.md) |
| Appearance | Settings → Appearance applies a theme card. `settings.json` `skin` matches, and animal themes rename Send. | [features/appearance.md](features/appearance.md) |
| Mentions | A highlight word lights a later line and the avatar shows a mention count. Mention sound stays off until the switch is on. | [features/mentions.md](features/mentions.md) |
| Spell check | After login, `recieve` in the message box gets a wavy underline. | [features/spell-check.md](features/spell-check.md) |
| Quick switch | Ctrl+K opens "Switch channel". Enter focuses a channel. A new name can be added from the same box. | [features/quick-switch.md](features/quick-switch.md) |
| Read only and hide the strip | Ctrl+Shift+R hides the message box. Ctrl+Shift+H hides the top strip and shows "Show UI". | [features/read-only-and-hide-ui.md](features/read-only-and-hide-ui.md) |
| Per channel | Settings → Per channel turns one feature off for one channel without changing the global switch. | [features/per-channel.md](features/per-channel.md) |
| Chat history on this PC | Remember chat history writes `chat/<channel>.jsonl` under the data directory. Turning it off removes those files. | [features/chat-history.md](features/chat-history.md) |
| History server | Settings → Account & history saves the mock logger address. The status says whether that channel is recorded. The read token is not in `settings.json`. | [features/history-server.md](features/history-server.md) |
| Settings search | The gear opens Settings. The search box filters rows and says when nothing matches. | [features/settings-search.md](features/settings-search.md) |
| Backup and reset | Back up writes a JSON file with channels and preferences and without a Twitch token. Reset returns the theme and switches to defaults. | [features/backup-and-reset.md](features/backup-and-reset.md) |
| Updates | Check now talks to GitHub. Install stays disabled until a real newer portable build is offered. Do not install. | [features/updates.md](features/updates.md) |
| Window, tray, and startup | Close to tray, Quit confirmation, and Start with Windows. The Startup shortcut exists only on Windows. | [features/window-and-tray.md](features/window-and-tray.md) |
| Reply | Hover a chat line, choose Reply, and the box shows "Replying to @TokayTom". | [features/reply.md](features/reply.md) |
