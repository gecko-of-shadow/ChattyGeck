# Mentions

Messages that say your name, reply to you, or contain a highlight word light up and count on the channel avatar. The window title gains a count. An optional chime plays, off until you turn it on, with a cooldown from 1 to 120 seconds and a Play button.

## Sub-features

- `mention-word` saves a highlight word.
- `mention-count` badges the avatar when a matching line is visible in a chat that is not focused.
- `mention-sound` turns the chime on and plays a preview.

## How to get to it (user POV)

- Gear → Chat & mentions → Highlight words.
- Type a word and save it (the field commits with its Save control, or by leaving the field, as the row shows).
- Gear → Chat & mentions → Mention sound. Choose Play to hear it before relying on chat.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor.
- A highlight only counts when a line containing the word arrives. The mock's only automatic line is the welcome sentence, which does not include a custom word. Do not inject a line through a mock test route.

- **Save a word.** Open Settings, choose "Chat & mentions". Run `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser fill --id pref-highlight --value gecko` then `node .claude/skills/verify-zoochattr/scripts/verify.mjs browser key --key Control+Enter`. The list saves on Ctrl+Enter or when the field blurs. `side-effect` shows `"highlightWords": ["gecko"]`. Screenshot `--out mentions/word.png`.
- **Sound off.** The Mention sound switch is off by default. `side-effect` shows `"mentionSound": false`. Choose the switch only when you intend to turn it on, then choose "Play mention sound". This Linux proof did not judge whether audio played. On a machine with audio, the Play button is the check; a missing device is a failed audio check, not a pass.
- **Count.** Leave the journey here unless a line containing `gecko` shows up in a channel you are not looking at. The welcome line does not. Report the badge as not observed. Do not POST a burst to the mock.

## Gotchas

- Your login counts as a mention only after you are logged in. Anonymous mode still counts highlight words.
- The title prefix `(n) ZooChattr` is the document title. The tray tooltip mirrors it on the desktop shell. The stand-in has no tray.
- Cooldown hides later chimes. A single Play press does not prove the cooldown.
