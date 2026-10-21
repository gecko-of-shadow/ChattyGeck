# ZooChattr logger

A private recorder for your channels' chat, on Cloudflare's free plan. One always-on Durable Object reads the chat anonymously over Twitch IRC, like a logged-out viewer, and keeps 24 hours in D1. ZooChattr reads it back at startup to fill the gap while your PC was off. There's no Twitch app, client secret or permission to grant, and you don't need to be a moderator. Reading needs your `READ_TOKEN`; there are no public pages.

- `src/recorder.ts` and `src/reader.ts`: the `ChatRecorder` object. It holds lines for up to 10 seconds, then writes them together. Deletes, timeouts and cleared chats remove the lines they cover. An alarm every minute checks the connection and restarts it after a deploy.
- `src/worker.ts`: `GET /api/v2/recent-messages/<login>` (recent-messages format) and `GET /status` (the recorder's state), both behind `READ_TOKEN`. A cron runs every 10 minutes, deletes anything older than 24 hours and starts the recorder if it isn't running.
- `npm test`: real Twitch IRC lines through a fake socket, the storage SQL on real SQLite, and ZooChattr's parser reading the lines back.

## One-time setup (PowerShell, in this `logger` folder)

**Cloudflare** (free plan, email and password, no card)
1. Sign up at https://dash.cloudflare.com/sign-up and verify your email. Open **Workers & Pages** once and pick your free `workers.dev` subdomain. ZooChattr's settings and this public repo will show it, so pick one that doesn't give away your name or email.
2. Run `npx wrangler login` and click **Allow** in the browser.
3. Run `npx wrangler d1 create zoochattr-chat`. Put the `database_id` it prints into `wrangler.toml`, then run `npx wrangler d1 execute zoochattr-chat --remote --file=schema.sql`.
4. Run `npx wrangler deploy`. Note the `https://zoochattr-logger.<subdomain>.workers.dev` address it prints.

**Secrets** (they live in Cloudflare, never in this repo)
5. The read token. This copies a fresh 64-character hex value to your clipboard without showing it:
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) | Set-Clipboard
   ```
   Run `npx wrangler secret put READ_TOKEN`, paste, and press Enter. Keep a copy in your password manager; ZooChattr needs it.
6. The channels. Run `npx wrangler secret put CHANNELS` and type the logins, separated by commas (`channelone,channeltwo`). To change the list later, run it again: the recorder restarts with the new list within a minute.

**Check it**
7. The cron starts the recorder within 10 minutes. Then, with the read token in the clipboard:
   ```powershell
   Invoke-RestMethod https://zoochattr-logger.<subdomain>.workers.dev/status -Headers @{ Authorization = "Bearer $(Get-Clipboard)" }
   ```
   Expect `state: connected` and your channels under `joined`. Calling `/status` also starts the recorder if it isn't running yet.
8. In ZooChattr, open Settings → Window → **History server**. Paste the address and the read token, then click **Save**. It should say "Connected".

## Free-plan budget

- **Durable Object time:** an object holding a socket can't hibernate, so the recorder uses about 11,000 of the 13,000 GB-s a day. That's why there is exactly one.
- **Requests:** about 1,600 a day (the alarm and the cron), plus at most one per 20 messages Twitch sends. The limit is 100,000.
- **D1 rows written:** each write costs one row per channel and minute, and the cron deletes each row once. A channel chatting around the clock costs about 10,000 a day of the 100,000.
- **What can be lost:** up to 10 seconds of held lines when Cloudflare restarts the object (a deploy, or their maintenance), and a second or two while it reconnects.

Past any limit, writes fail until 00:00 UTC. The recorder keeps up to 20,000 lines in memory meanwhile, and `/status` shows the problem.

## Undo

- `npx wrangler delete` removes the Worker and the recorder.
- `npx wrangler d1 delete zoochattr-chat` removes the stored chat.
