import { historyBoundary, isHistoryBoundary } from "@/lib/chat/history";
import { parseIrcLine } from "@/lib/irc/parser";
import { privmsgToChat, systemMessage } from "@/lib/twitch/messages";
import type { ChatMessage } from "@/lib/twitch/types";

/*
 * Client for the private chat logger (logger/), which records chat while ZooChattr is closed.
 * It answers like recent-messages: GET <server>/api/v2/recent-messages/<login>?after=&before=&limit=
 * with `Authorization: Bearer <READ_TOKEN>`, and returns raw IRC lines, oldest first.
 */

/** Most lines one request returns (the logger's cap, like recent-messages). */
export const PAGE_LIMIT = 800;
/** Ask from this long before the newest saved line: covers lines a crash never wrote, and clock drift. */
export const OVERLAP_MS = 2 * 60_000;
/** Up to 8,000 lines per channel per fill. A longer gap keeps its oldest part missing. */
export const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 5_000;
/** Paging stops after this long, so a slow server never holds a channel's chat back for long. */
const FILL_DEADLINE_MS = 8_000;

/**
 * The server's origin (`https://name.you.workers.dev`), "" when blank, or null when it isn't an address
 * ZooChattr will send the token to: https, or plain http only on this computer.
 */
export function parseHistoryServer(text: string): string | null {
  const value = text.trim();
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return url.origin;
  return null;
}

export type HistoryServerProblem = "unauthorized" | "unreachable" | "bad-response";

export class HistoryServerError extends Error {
  readonly problem: HistoryServerProblem;

  constructor(problem: HistoryServerProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

interface PageRequest {
  server: string;
  token: string;
  channel: string;
  after?: number;
  before?: number;
  limit: number;
  fetchImpl: typeof fetch;
}

/** One read. Null when the server doesn't record this channel. */
async function requestPage(request: PageRequest): Promise<string[] | null> {
  const query = new URLSearchParams({ limit: String(request.limit) });
  if (request.after !== undefined) query.set("after", String(Math.floor(request.after)));
  if (request.before !== undefined) query.set("before", String(Math.floor(request.before)));
  const url = `${request.server}/api/v2/recent-messages/${encodeURIComponent(request.channel)}?${query}`;
  // Called bare: the browser's fetch throws "Illegal invocation" when `this` is anything but the window.
  const { fetchImpl } = request;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${request.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "TimeoutError"
        ? `no answer in ${REQUEST_TIMEOUT_MS / 1000} seconds`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new HistoryServerError("unreachable", `Couldn't reach ${new URL(request.server).host} (${reason}).`);
  }
  if (res.status === 401) throw new HistoryServerError("unauthorized", "The history server turned down the read token.");
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Checked below: a page that isn't JSON is a bad answer.
  }
  const data = (body && typeof body === "object" ? body : {}) as { messages?: unknown; error?: unknown; error_code?: unknown };
  if (res.status === 404 && data.error_code === "channel_not_joined") return null;
  if (!res.ok) {
    const detail = typeof data.error === "string" && data.error ? `: ${data.error}` : "";
    throw new HistoryServerError("bad-response", `The history server answered ${res.status}${detail}.`);
  }
  if (!Array.isArray(data.messages)) throw new HistoryServerError("bad-response", "The history server's answer had no message list.");
  return data.messages.filter((line): line is string => typeof line === "string");
}

export type ServerCheck = { ok: true; recorded: boolean } | { ok: false; problem: HistoryServerProblem; message: string };

/** One tiny read to see whether the address and token work. The token is checked before the channel. */
export async function checkHistoryServer(server: string, token: string, channel: string, fetchImpl: typeof fetch = fetch): Promise<ServerCheck> {
  try {
    const lines = await requestPage({ server, token, channel, limit: 1, fetchImpl });
    return { ok: true, recorded: lines !== null };
  } catch (err) {
    if (err instanceof HistoryServerError) return { ok: false, problem: err.problem, message: err.message };
    return { ok: false, problem: "unreachable", message: String(err) };
  }
}

function sentAt(line: string | undefined): number | undefined {
  const ts = Number(parseIrcLine(line ?? "")?.tags["tmi-sent-ts"]);
  return Number.isFinite(ts) && ts > 0 ? ts : undefined;
}

export interface FillRequest {
  server: string;
  token: string;
  channel: string;
  /** Lines at or before this time (ms) are already saved. */
  after?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface FillResult {
  /** Raw lines, oldest first. A page boundary can repeat a line; {@link serverMessages} drops repeats. */
  lines: string[];
  /** The gap held more than the pages allowed (or paging broke off), so its oldest part is still missing. */
  truncated: boolean;
}

/**
 * Everything the server has after `after`, newest page first, paging back with `before`.
 * Null when the server doesn't record this channel. Throws only when the first page fails.
 */
export async function fetchServerLines(request: FillRequest): Promise<FillResult | null> {
  const fetchImpl = request.fetchImpl ?? fetch;
  const now = request.now ?? Date.now;
  const deadline = now() + FILL_DEADLINE_MS;
  const pages: string[][] = [];
  let before: number | undefined;
  let truncated = false;
  for (;;) {
    let lines: string[] | null;
    try {
      lines = await requestPage({ ...request, before, limit: PAGE_LIMIT, fetchImpl });
    } catch (err) {
      if (!pages.length) throw err;
      truncated = true;
      break;
    }
    if (lines === null) {
      if (!pages.length) return null;
      break;
    }
    pages.push(lines);
    if (lines.length < PAGE_LIMIT) break;
    const oldest = sentAt(lines[0]);
    // A whole page in one millisecond can't be paged past.
    if (oldest === undefined || (before !== undefined && oldest + 1 >= before) || pages.length >= MAX_PAGES || now() >= deadline) {
      truncated = true;
      break;
    }
    // +1 asks again for lines that share the oldest time, in case the page cut between them.
    before = oldest + 1;
  }
  return { lines: pages.reverse().flat(), truncated };
}

/** The server's chat lines as messages, oldest first, one per Twitch message id. */
export function serverMessages(lines: readonly string[], selfLogin?: string): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const line of lines) {
    const parsed = parseIrcLine(line);
    const id = parsed?.tags.id;
    if (!parsed || parsed.command !== "PRIVMSG" || !id || seen.has(id)) continue;
    seen.add(id);
    out.push(privmsgToChat(parsed, selfLogin));
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Time of the newest line that came from Twitch (not notices, dividers or unconfirmed sends). */
export function newestTwitchTime(messages: readonly ChatMessage[]): number | undefined {
  let newest: number | undefined;
  for (const message of messages) {
    if (message.kind !== "chat" && message.kind !== "action" && message.kind !== "event") continue;
    if (message.pending || message.id.startsWith("send-")) continue;
    if (newest === undefined || message.ts > newest) newest = message.ts;
  }
  return newest;
}

/** The line above what the server filled in. */
export function fillNote(channel: string, added: readonly ChatMessage[], truncated: boolean): ChatMessage {
  const count = added.length;
  const text = truncated
    ? `Filled in the newest ${count} messages from your history server. Older ones from that gap are still missing.`
    : `Filled in ${count} ${count === 1 ? "message" : "messages"} from your history server.`;
  return { ...systemMessage(channel, text), ts: added[0]?.ts ?? Date.now() };
}

/** Two newest-last lists as one. On equal times the first list's row stays first. */
function mergeByTime(a: readonly ChatMessage[], b: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) out.push(b[j].ts < a[i].ts ? b[j++] : a[i++]);
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

/**
 * Puts the server's lines into a channel's list without doubles. A line already there (saved or live) wins,
 * so a delete ZooChattr saw is kept. New lines go above the "Earlier session" divider in time order, after
 * the optional note. Returns the same array when nothing is new.
 */
export function mergeServerMessages(
  messages: ChatMessage[],
  incoming: readonly ChatMessage[],
  channel: string,
  note?: (added: readonly ChatMessage[]) => ChatMessage,
): { messages: ChatMessage[]; added: ChatMessage[] } {
  const known = new Set<string>();
  for (const message of messages) known.add(message.id);
  const added: ChatMessage[] = [];
  for (const message of incoming) {
    if (message.channel !== channel || known.has(message.id)) continue;
    known.add(message.id);
    added.push(message);
  }
  if (!added.length) return { messages, added };
  added.sort((a, b) => a.ts - b.ts);
  const block = note ? [note(added), ...added] : added;
  const divider = messages.findIndex(isHistoryBoundary);
  if (divider < 0) return { messages: [...block, historyBoundary(channel), ...messages], added };
  return { messages: [...mergeByTime(messages.slice(0, divider), block), ...messages.slice(divider)], added };
}
