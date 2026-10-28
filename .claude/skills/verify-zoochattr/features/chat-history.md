# Chat history on this PC

"Remember chat history" keeps about 48 hours of messages per channel in the data directory so logs come back after a restart. The files are `chat/<login>.jsonl` under `ZOOCHATTR_DATA_DIR`. Turning the switch off stops saving and wipes what is stored. "Clear saved chat history" deletes the files and the lines on screen.

## Sub-features

- `history-file` writes a jsonl file for a joined channel.
- `history-restore` shows those lines again after a fresh launch with the same data directory.
- `history-clear` removes the files from Settings.
- `history-off` removes them when the switch is turned off.

## How to get to it (user POV)

- Gear → Account & history → Remember chat history. It is on by default.
- "Clear saved chat history" is on the same page.
- Quit and open ZooChattr again. The channel's recent lines are already there.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor (not the browser stand-in). The stand-in does not write `chat/*.jsonl`.
- `geckotown` joined so the welcome line exists.
- The same `dataDir` printed by launch. Cleanup deletes it, so restore has to be a second launch that reuses a copy of the directory. This harness always creates a new empty directory. Restoring across two launches is not one `launch` call. Report restore as a second manual launch with `ZOOCHATTR_DATA_DIR` pointed at a copy of the evidence-time data dir, or leave restore unchecked if you did not do that.

- **Wait for the file.** The app appends about every 30 seconds, and also on page hide. After the welcome line has been on screen, wait 35 seconds, then look in the data directory for `chat/geckotown.jsonl`. The line text `grab a warm rock` is inside it. Copy that file into the evidence directory yourself if you want it kept; cleanup deletes the data directory.
- **Clear.** Settings → Account & history, button test id `clear-chat-history` ("Clear saved chat history"). The toast says the saved logs are gone. `chat/geckotown.jsonl` is gone. The on-screen log for that channel is empty.
- **Switch off.** Turn off "Remember chat history" (`id` `pref-chat-history`). `side-effect` shows `"rememberChatHistory": false` and the chat directory is empty.

## Gotchas

- Checking the file one second after the line appears fails even when history works. The flush interval is 30 seconds.
- `settings.json` does not contain the messages. The jsonl file does.
- Clear and the off switch both delete history. Do not run both and then wonder which one deleted it. Run one, confirm, then the other on a new line if you need both.
- A release build's folder is `ZooChattr-data` next to the exe unless `ZOOCHATTR_DATA_DIR` is set. This harness always sets that variable.
