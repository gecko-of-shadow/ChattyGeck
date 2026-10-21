import type { ReaderStatus } from "./reader";
import { dropExpired, MAX_LIMIT, recentLines, type Db } from "./store";

export { ChatRecorder } from "./recorder";

/** The slice of the Durable Object binding this Worker uses: RPC calls to the one recorder. */
export interface RecorderNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { start(): Promise<ReaderStatus>; flush(): Promise<ReaderStatus> };
}

export interface Env {
  DB: Db;
  /** The ChatRecorder object that reads chat into DB. */
  RECORDER: RecorderNamespace;
  /** Channel logins to record, comma-separated. A secret, so the list stays out of this public repo. */
  CHANNELS?: string;
  /** What ZooChattr sends as `Authorization: Bearer ...` to read history. */
  READ_TOKEN: string;
  /** Comma-separated page origins allowed to read from a browser engine. */
  ALLOWED_ORIGINS?: string;
}

const READ_PATH = /^\/api\/v2\/recent-messages\/([A-Za-z0-9_]{1,25})$/;
const encoder = new TextEncoder();

type Equal = (a: ArrayBufferView, b: ArrayBufferView) => boolean;

/** Constant-time compare. Workers' timingSafeEqual throws on different lengths, so check those first. */
function sameSecret(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return (crypto.subtle as SubtleCrypto & { timingSafeEqual: Equal }).timingSafeEqual(left, right);
}

const recorder = (env: Env) => env.RECORDER.get(env.RECORDER.idFromName("main"));

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** CORS headers for an allowed page origin; nothing for anyone else. */
function corsFor(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

function authorized(request: Request, env: Env): boolean {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!env.READ_TOKEN && sameSecret(token, env.READ_TOKEN);
}

async function readHistory(request: Request, env: Env, login: string, url: URL): Promise<Response> {
  const cors = corsFor(request, env);
  if (!authorized(request, env)) return json({ messages: [], error: "Unauthorized", error_code: "unauthorized" }, 401, cors);
  const number = (name: string) => {
    const value = Number(url.searchParams.get(name));
    return url.searchParams.has(name) && Number.isFinite(value) ? value : undefined;
  };
  // ZooChattr joins chat right after its first page, and Twitch never replays what was said before a
  // JOIN: so that page first has the recorder write what it's holding. Older pages don't need it.
  if (!url.searchParams.has("before")) {
    try {
      await recorder(env).flush();
    } catch (err) {
      console.log("recorder flush failed", String(err));
    }
  }
  const lines = await recentLines(env.DB, login, {
    after: number("after"),
    before: number("before"),
    limit: number("limit") ?? MAX_LIMIT,
    now: Date.now(),
  });
  if (!lines) return json({ messages: [], error: "This channel isn't recorded", error_code: "channel_not_joined" }, 404, cors);
  return json({ messages: lines, error: null, error_code: null }, 200, { ...cors, "Cache-Control": "no-store" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = READ_PATH.exec(url.pathname);
    if (match && request.method === "OPTIONS") {
      const cors = corsFor(request, env);
      if (!cors["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Max-Age": "86400" },
      });
    }
    if (match && request.method === "GET") return readHistory(request, env, match[1], url);
    // The recorder's state, for checking on it by hand. It also starts the recorder if it isn't running.
    if (url.pathname === "/status" && request.method === "GET") {
      if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
      return json(await recorder(env).start(), 200, { "Cache-Control": "no-store" });
    }
    // No public pages: everything else is a plain 404.
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    // The recorder's alarm keeps it going; the cron also starts it after the first deploy.
    await Promise.all([dropExpired(env.DB), recorder(env).start()]);
  },
};
