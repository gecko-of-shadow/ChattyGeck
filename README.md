# ZooChattr

A portable Windows 11 desktop app for reading several Twitch chats at once, old-school multi-channel IRC style, with a gecko soul. Log in with Twitch to chat back. Twitch, 7TV, BetterTTV and FrankerFaceZ emotes render inline.

Built with Tauri 2, React, TypeScript and Tailwind. No backend of its own: it talks to Twitch chat over the official IRC WebSocket and pulls emotes from the public emote APIs.

## What it does

- **Many channels, one window.** Join and leave channels freely. Connections stay open while the app runs, and drops are recovered automatically with backoff ("dropped the connection like a tail, regrowing it in 4s").
- **Two reading modes.**
  - **Merged:** one feed for every channel, each line tagged with a colored `#channel` chip. Click a chip to make that channel the send target.
  - **Focused:** one channel at a time. The others show unread counts, plus a gecko-eye badge when someone mentions you.
- **Chat as yourself.** Log in with Twitch's device login (type a code at twitch.tv/activate; your password never touches ZooChattr). Press Enter to send, `/me` works, and ↑/↓ recall what you sent. The composer shows emote-only, followers-only, subs-only and slow mode.
- **Emotes everywhere.** Twitch emotes come from chat tags. 7TV, BetterTTV and FrankerFaceZ load global and channel sets for every joined channel, including zero-width overlay emotes. If a provider is down, its emotes are skipped and the smiley chip in the channel header says why.
- **IRC feel.** Dense dark log with timestamps, badges, name colors (lifted for readability), reply context, sub/raid events, first-time-chatter eggs, moderator deletions, and links that open in your browser.
- **Gecko everything.** Five skins (Shadow, Leopard, Crested, Tokay, Day gecko), granular scale textures, an animated gecko mascot, and toe-pad "stick to live chat" scrolling.
- **Remembers you.** Channels, reading mode, skin and display preferences survive restarts.
- **Portable.** One `.exe` and nothing to install. Settings live in a `ZooChattr-data` folder next to it.

## Run it in development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+.
- [Rust](https://rustup.rs/) (stable).
- On Windows: the "Desktop development with C++" workload from Visual Studio Build Tools. WebView2 is already part of Windows 11. See [Tauri's prerequisites](https://tauri.app/start/prerequisites/) for other platforms.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run tauri dev
```

The desktop window opens with hot reload. `npm run dev` runs only the UI in a browser at http://127.0.0.1:17420. That's handy for styling, but logins aren't saved between browser sessions.

## Set up Twitch login (Client ID)

Reading chat works with no setup (anonymous, read-only). Sending needs a Twitch Client ID:

1. Open the [Twitch Developer Console](https://dev.twitch.tv/console/apps/create) and register an application.
2. **Name:** anything unique, e.g. `ZooChattr (yourname)`.
3. **OAuth Redirect URLs:** `http://localhost`. ZooChattr uses Twitch's device-code login and never redirects, but the form requires a URL.
4. **Category:** Chat Bot (or Application Integration).
5. **Client Type:** **Public**. This matters: public clients can use device login and refresh tokens without a client secret, which a desktop app can't keep secret anyway.
6. Copy the **Client ID** into `.env`:

   ```bash
   TWITCH_CLIENT_ID=your_client_id_here
   ```

   It's baked into the build, so friends who get your `.exe` can log in without any setup. You can also paste a Client ID at runtime in **Settings → Twitch account**, which overrides the built-in one.

ZooChattr asks only for `chat:read` and `chat:edit`. It re-validates the token every hour, as Twitch requires, and refreshes it automatically when it expires.

### Where the login is stored

| Platform | Token storage |
| --- | --- |
| Windows | Windows Credential Manager, generic credential `twitch-session.ZooChattr` |
| macOS | Keychain |
| Linux (dev only) | Kernel keyring, cleared when you log out of your desktop session |

The token is never written into the portable folder. **Log out** in ZooChattr revokes it on Twitch and deletes it. If the credential store refuses to save it, ZooChattr keeps the login for the current session only and tells you.

## Build the portable .exe

On Windows, from the repo root:

```bash
npm install
npm run build:portable
```

That runs `tauri build --no-bundle` (a release build with the UI embedded in the binary, no installer) and then collects the result:

```
release/
  ZooChattr-portable/
    ZooChattr.exe      ← the whole app (about 3.5 MB)
    README.txt
  ZooChattr-portable-0.1.0.zip
```

Copy `ZooChattr-portable` anywhere, such as a USB stick or Dropbox, and double-click `ZooChattr.exe`. On first run it creates `ZooChattr-data\` next to itself, holding `settings.json` and the WebView cache. If the folder isn't writable (e.g. under Program Files), it falls back to `%APPDATA%\com.geckoofshadow.zoochattr`. Settings shows which location is in use.

The exe isn't code-signed, so SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.

### Cross-compiling from Linux or macOS (experimental)

Tauri can build the Windows exe without Windows using [cargo-xwin](https://github.com/rust-cross/cargo-xwin). It produces the same portable `ZooChattr.exe`, but try it on a Windows machine before sharing it.

```bash
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
# Debian/Ubuntu: sudo apt install clang lld llvm   (needs llvm-rc and lld-link)
npm run build:windows-cross
```

## Test without a Twitch account

`scripts/mock-twitch.mjs` is an offline stand-in for Twitch. It provides device login (auto-approved), token validate/refresh/revoke, the Helix calls ZooChattr makes, and an IRC server that behaves like Twitch where it matters: one command per frame, no echo to the sending connection, `USERSTATE` after sends, `NOTICE` on failures.

```bash
npm run mock:twitch     # terminal 1
npm run dev:mock        # terminal 2: browser UI on http://127.0.0.1:17440, wired to the mock
npm run e2e:mock        # terminal 3: drives the whole flow in headless Chrome
npm run tauri:mock      # or: the desktop app wired to the mock
```

Other checks:

```bash
npm test                # unit tests (IRC parser, reconnects, emote parsing, tokenizer…)
npm run typecheck
cd src-tauri && cargo test
SOAK_URL=http://127.0.0.1:17420 SOAK_MINUTES=60 SOAK_CHANNELS=xqc,summit1g npm run soak   # live soak, logs to soak/
```

The e2e and soak scripts use `playwright-core` with an installed Chrome. Set `CHROME_PATH` if yours isn't at `/usr/local/bin/google-chrome`.

## Configuration reference

| Variable | Where | Purpose |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | `.env` | Public Client ID used for login. Empty means read-only mode until one is set in Settings. |
| `VITE_TWITCH_IRC_URL` | `.env` / `.env.mock` | Chat endpoint. Defaults to `wss://irc-ws.chat.twitch.tv:443`. |
| `VITE_TWITCH_AUTH_BASE` | `.env` / `.env.mock` | OAuth endpoint. Defaults to `https://id.twitch.tv`. |
| `VITE_TWITCH_HELIX_BASE` | `.env` / `.env.mock` | Helix API. Defaults to `https://api.twitch.tv/helix`. |
| `VITE_7TV_API`, `VITE_BTTV_API`, `VITE_FFZ_API` | `.env` | Emote API overrides (rarely needed). |
| `ZOOCHATTR_DATA_DIR` | runtime env | Forces the data folder, e.g. for testing a clean profile. |

Only `.env.example` and `.env.mock` are committed. `.env` is git-ignored.

## How it works

- **Two IRC connections**, the same way Chatterino does it. The *read* connection joins every channel; it's anonymous (`justinfan…`) when logged out and authenticated when logged in. The *write* connection only sends. Twitch echoes your message back on the read connection with full emote tags, and ZooChattr swaps that echo in for its local "sending…" copy. A `NOTICE` (rate limit, followers-only, etc.) marks the message as not sent and shows the reason.
- **Reconnects:** exponential backoff with jitter (1s → 30s), immediate retry when Windows reports the network is back, honoring Twitch's `RECONNECT`, and a keepalive ping that catches dead sockets after sleep or Wi-Fi changes. JOINs are paced under Twitch's rate limit.
- **Emotes:** `src/lib/emotes/` fetches 7TV (`7tv.io/v3`), BetterTTV (`api.betterttv.net/3/cached`) and FrankerFaceZ (`api.frankerfacez.com/v1`) global sets once, and channel sets whenever a channel is joined. Lookup order is channel over global, then 7TV › BTTV › FFZ. Twitch's own emotes come from the `emotes` IRC tag, indexed by Unicode code point so emoji don't shift them.
- **Badges:** with a login, Helix provides exact global and channel badges (custom sub badges included). Anonymous mode falls back to Twitch's public images for broadcaster, mod, VIP, sub, Prime and similar.
- **Storage:** the Rust side (`src-tauri/src`) is deliberately small. It provides the portable data folder, atomic `settings.json` writes (a corrupt file is renamed aside, never deleted), and the OS credential store via the `keyring` crate.
- **Rules followed:** official Twitch IRC and Helix plus the documented public emote APIs only. No scraping of twitch.tv.

## Reusing your existing emote app

The prompt's emote-app location was left blank, so emote support here is built directly on the public 7TV, BTTV and FFZ APIs. To fold your emote app in later:

- Provider fetchers live in `src/lib/emotes/providers.ts` (`globalFetchers` / `channelFetchers`). Swap or extend those with your app's fetch logic.
- `src/lib/emotes/registry.ts` merges and caches per channel. `src/lib/chat/tokenize.ts` turns text into emote fragments.
- Rendering (sizes, zero-width stacking, hover preview) is in `src/components/chat/MessageRow.tsx` and `ChatLog.tsx`.

## Project layout

```
src/
  lib/irc/          IRC parser + reconnecting WebSocket connection
  lib/twitch/       message mapping, device login, Helix (badges, users)
  lib/emotes/       7TV / BTTV / FFZ providers and the per-channel registry
  lib/chat/         controller (connections, buffering, sending) + tokenizer
  store/            Zustand stores: chat state, settings, UI
  components/       chat log, composer, sidebar, dialogs, gecko art
src-tauri/          Rust shell: data folder, settings file, credential store
scripts/            mock Twitch, end-to-end run, soak test, portable packaging
```

## Troubleshooting

- **Blank window on Linux VMs:** start with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **"Twitch doesn't recognise this Client ID":** check for extra spaces, and make sure the app's Client Type is **Public**.
- **Login works but expires right away:** confidential (non-public) Twitch apps can't refresh without a secret. Switch the app to Public, or log in again when asked.
- **A channel stays on "Joining…" then errors:** the name is misspelled, or the channel is banned or deleted.
