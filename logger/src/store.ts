/** The slice of Cloudflare's D1 API this logger uses (tests pass an SQLite stand-in). */
export interface Db {
  prepare(sql: string): { bind(...values: unknown[]): Statement };
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Statement {
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

/** One chat line as Twitch sent it, with its channel's room id and Twitch's send time. */
export interface Heard {
  channelId: string;
  line: string;
  ts: number;
}

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;
/** Most lines one read returns, like recent-messages. */
export const MAX_LIMIT = 800;

/** One row per channel per minute: new lines join that minute's row. */
const APPEND =
  "INSERT INTO chat_bucket VALUES(?1,?2,?3,?4,?5) ON CONFLICT(channel_id,minute) DO UPDATE SET lines=lines||char(10)||excluded.lines, n=n+excluded.n, last_ts=max(last_ts,excluded.last_ts)";
const REMEMBER_CHANNEL = "INSERT OR IGNORE INTO channel(channel_id, login) VALUES(?1, ?2)";

/** One tag's raw value from a stored line (message ids, user ids and times never need unescaping). */
export function tagOf(line: string, name: string): string | undefined {
  if (!line.startsWith("@")) return undefined;
  const end = line.indexOf(" ");
  for (const part of line.slice(1, end < 0 ? undefined : end).split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return undefined;
}

/**
 * Remembers each `[channelId, login]`, then appends the lines, in one batch. D1 bills rows written,
 * not lines, so each channel's minute gets one statement however many lines it holds.
 */
export async function storeLines(db: Db, lines: readonly Heard[], channels: readonly (readonly [string, string])[] = []): Promise<void> {
  const rows = new Map<string, { channelId: string; minute: number; lines: string[]; last: number }>();
  for (const heard of lines) {
    const minute = Math.floor(heard.ts / MINUTE_MS);
    const key = `${heard.channelId}/${minute}`;
    const row = rows.get(key);
    if (row) {
      row.lines.push(heard.line);
      row.last = Math.max(row.last, heard.ts);
    } else {
      rows.set(key, { channelId: heard.channelId, minute, lines: [heard.line], last: heard.ts });
    }
  }
  const statements = [
    ...channels.map(([channelId, login]) => db.prepare(REMEMBER_CHANNEL).bind(channelId, login.toLowerCase())),
    ...[...rows.values()].map((row) => db.prepare(APPEND).bind(row.channelId, row.minute, row.lines.join("\n"), row.lines.length, row.last)),
  ];
  if (statements.length) await db.batch(statements);
}

/**
 * Rewrites (or drops) each of the channel's minute rows that hold a line `drop` rejects. `needle` only
 * narrows the search: it may also match other rows (a reply quoting the message), which stay untouched.
 */
async function stripLines(db: Db, channelId: string, needle: string, drop: (line: string) => boolean): Promise<void> {
  const { results } = await db
    .prepare("SELECT minute, lines FROM chat_bucket WHERE channel_id=?1 AND instr(lines, ?2) > 0")
    .bind(channelId, needle)
    .all<{ minute: number; lines: string }>();
  const writes: Statement[] = [];
  for (const row of results) {
    const lines = row.lines.split("\n");
    const kept = lines.filter((line) => !drop(line));
    if (kept.length === lines.length) continue;
    writes.push(
      kept.length
        ? db.prepare("UPDATE chat_bucket SET lines=?3, n=?4 WHERE channel_id=?1 AND minute=?2").bind(channelId, row.minute, kept.join("\n"), kept.length)
        : db.prepare("DELETE FROM chat_bucket WHERE channel_id=?1 AND minute=?2").bind(channelId, row.minute),
    );
  }
  if (writes.length) await db.batch(writes);
}

/** True when this line is the message with this id. */
export const isMessage = (line: string, messageId: string) => tagOf(line, "id") === messageId;
/** True when this user sent this line. */
export const isFromUser = (line: string, userId: string) => tagOf(line, "user-id") === userId;

/** A moderator deleted one message. Twitch sorts tags by name, so `id` can sit anywhere in the line. */
export function deleteMessage(db: Db, channelId: string, messageId: string): Promise<void> {
  return stripLines(db, channelId, `id=${messageId}`, (line) => isMessage(line, messageId));
}

/** A user was timed out or banned: their messages go. */
export function clearUserMessages(db: Db, channelId: string, userId: string): Promise<void> {
  return stripLines(db, channelId, `user-id=${userId}`, (line) => isFromUser(line, userId));
}

/** The whole chat was cleared. */
export async function clearChannel(db: Db, channelId: string): Promise<void> {
  await db.prepare("DELETE FROM chat_bucket WHERE channel_id=?1").bind(channelId).run();
}

/** The cron's job: nothing older than 24 hours is kept. */
export async function dropExpired(db: Db): Promise<void> {
  await db.prepare("DELETE FROM chat_bucket WHERE minute < (unixepoch()*1000-86400000)/60000").bind().run();
}

/**
 * The newest minute rows that hold the next ?4 lines (`n` counts a row's lines), newest first.
 * Reading only these keeps a busy channel's read inside the free plan's 10ms of CPU: every line
 * in the window would be ~17ms at 10,000 lines.
 */
const NEWEST_ROWS =
  "SELECT minute, lines FROM (SELECT minute, lines, n, sum(n) OVER (ORDER BY minute DESC) AS upto FROM chat_bucket WHERE channel_id=?1 AND minute>=?2 AND minute<=?3) WHERE upto-n < ?4 ORDER BY minute DESC";

/**
 * The channel's lines oldest to newest: within the last 24 hours, after `after` and before
 * `before` (milliseconds), one copy per message id, at most the newest `limit`.
 * Null when this channel has never been recorded.
 */
export async function recentLines(
  db: Db,
  login: string,
  options: { after?: number; before?: number; limit: number; now: number },
): Promise<string[] | null> {
  const channel = await db.prepare("SELECT channel_id FROM channel WHERE login=?1").bind(login.toLowerCase()).first<{ channel_id: string }>();
  if (!channel) return null;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(options.limit)));
  const from = Math.max(options.now - DAY_MS, options.after ?? 0);
  const to = Math.min(options.before ?? Infinity, options.now + MINUTE_MS);
  const firstMinute = Math.floor(from / MINUTE_MS);
  let lastMinute = Math.floor(to / MINUTE_MS);

  // A write D1 took but never confirmed is written again, so a line can be stored twice; keep its oldest copy.
  const picked = new Map<string, { ts: number; line: string }>();
  // Usually one pass. Repeated copies and lines just outside after/before can leave it short: then read older rows.
  while (picked.size < limit && lastMinute >= firstMinute) {
    const { results } = await db
      .prepare(NEWEST_ROWS)
      .bind(channel.channel_id, firstMinute, lastMinute, limit - picked.size)
      .all<{ minute: number; lines: string }>();
    if (!results.length) break;
    for (const row of results) {
      for (const line of row.lines.split("\n")) {
        const id = tagOf(line, "id");
        const ts = Number(tagOf(line, "tmi-sent-ts"));
        if (!id || !Number.isFinite(ts)) continue;
        if (ts < options.now - DAY_MS || (options.after !== undefined && ts <= options.after)) continue;
        if (options.before !== undefined && ts >= options.before) continue;
        const kept = picked.get(id);
        if (!kept || ts < kept.ts) picked.set(id, { ts, line });
      }
    }
    lastMinute = results[results.length - 1].minute - 1;
  }
  return [...picked.values()]
    .sort((a, b) => a.ts - b.ts)
    .slice(-limit)
    .map((entry) => entry.line);
}
