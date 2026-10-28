# Window, tray, and startup

Closing the window keeps ZooChattr in the system tray when "Close to tray" is on (the default). The tray menu is Show ZooChattr, Settings…, Check for updates…, and Quit ZooChattr. Quit asks for confirmation. Opening the exe again focuses the running copy instead of starting a second one, except on Linux when there is no `unix:` session bus. "Start with Windows" writes a shortcut in the Startup folder. That exists only on Windows.

## Sub-features

- `tray-close` hides the window and leaves the process running.
- `tray-quit` asks "Quit ZooChattr" before exiting (`data-testid=quit-confirm`).
- `single-instance` focuses the existing window on a second launch.
- `startup-shortcut` creates or removes the Startup shortcut on Windows.

## How to get to it (user POV)

- Close the window with the window's close button. With the default setting, the process remains and the tray icon remains.
- Right-click the tray icon and choose Quit ZooChattr. Confirm or cancel.
- Gear → Window & startup → Close to tray, and Start with Windows.
- Launch ZooChattr a second time. The existing window comes forward.

## Driving it with verify-zoochattr

Preconditions:

- Desktop doctor. Have a screenshot of the work you care about first. Closing or quitting ends the webdriver session.
- Linux without a `unix:` `DBUS_SESSION_BUS_ADDRESS` does not load the single-instance plugin. A second process can start. Do not call that a failed single-instance check; call it "not the Windows behavior".

- **Setting is on.** `side-effect` after any preference change shows `"closeToTray": true` by default. You can also open Window & startup and read the "Close to tray" switch (`id` `pref-tray`).
- **Start with Windows on Linux.** Turn on the switch "Start with Windows" (`id` `pref-startup`). A toast says "Couldn't change start on login" and "Start on login is only available on Windows." The switch returns to off. `side-effect` shows `"startOnLogin": false`. That is the correct Linux result. It is not a pass for the Startup shortcut.
- **Start with Windows on Windows.** Turn the switch on. A shortcut `ZooChattr.lnk` appears in the user's Startup folder. Turn it off and the shortcut is gone. This was not run on the Linux proof.
- **Quit confirm.** The tray item "Quit ZooChattr" opens the dialog `data-testid=quit-confirm`, titled "Quit ZooChattr?". Choose "Keep running". The window remains and doctor still says the process is alive. "Quit" flushes chat history and exits; run it only when you are done, then cleanup. This harness cannot click the tray icon, so a run that never opens that dialog has not proved Quit.
- **Second launch.** On Windows, start the exe again and confirm the first window focused and the second data directory was not used. If the empty-zoo heading is gone and your real channels are showing, you attached to the user's profile. Stop.

## Gotchas

- The harness does not click the tray icon. A recipe that only toggles "Close to tray" has not proved the window hides. Say that.
- Killing the verification pid from cleanup is not the Quit dialog. It does not prove the confirm step.
- Close-to-tray off means the close button exits. Do not turn it off and then expect the webdriver session to survive a close.
- `window.json` in the data directory is the window position, written when a move ends. It is not `settings.json`.
