import { describe, expect, it } from "vitest";
import type { ReaderStatus } from "./reader";
import { clearChannel, clearUserMessages, deleteMessage, dropExpired, storeLines, tagOf, type Heard } from "./store";
import { testDb } from "./test-db";
import { privmsg } from "./test-twitch";
import worker, { type Env } from "./worker";

// A test-only value, not a real secret.
const TOKEN = "test-read-token";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const carl = { login: "crestedcarl", userId: "3003" };

const heard = (id: string, ts: number, options: Parameters<typeof privmsg>[3] = {}): Heard => ({ channelId: "1001", line: privmsg(id, ts, id, options), ts });
const store = (db: ReturnType<typeof testDb>, ...lines: Heard[]) => storeLines(db, lines, [["1001", "GeckoTown"]]);

function setup() {
  const calls: string[] = [];
  let failFlush = false;
  const status = { state: "connected" } as ReaderStatus;
  const object = {
    start: async () => {
      calls.push("start");
      return status;
    },
    flush: async () => {
      calls.push("flush");
      if (failFlush) throw new Error("recorder unreachable");
      return status;
    },
  };
  const env: Env & { DB: ReturnType<typeof testDb> } = {
    DB: testDb(),
    READ_TOKEN: TOKEN,
    ALLOWED_ORIGINS: "http://tauri.localhost",
    RECORDER: {
      idFromName: (name) => `id:${name}`,
      get: (id) => {
        calls.push(`get ${String(id)}`);
        return object;
      },
    },
  };
  return { env, calls, failFlush: () => (failFlush = true) };
}

async function read(env: Env, path: string, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }) {
  const response = await worker.fetch(new Request(`https://logger.test${path}`, { headers }), env);
  return { status: response.status, headers: response.headers, body: (await response.json()) as { messages: string[]; error_code: string | null } };
}

const ids = (lines: string[]) => lines.map((line) => tagOf(line, "id"));
const rows = (db: ReturnType<typeof testDb>) => db.raw.prepare("SELECT minute, lines, n FROM chat_bucket ORDER BY minute").all() as { minute: number; lines: string; n: number }[];

describe("storage", () => {
  const at = Math.floor((Date.now() - 5 * MINUTE) / MINUTE) * MINUTE;

  it("keeps one row per channel per minute, with one statement per row however many lines it gets", async () => {
    const db = testDb();
    let statements = 0;
    const batch = db.batch;
    db.batch = (list) => {
      statements += list.length;
      return batch(list);
    };
    await store(db, heard("m0", at), heard("m1", at + 1), heard("m2", at + 2), heard("m9", at + MINUTE));
    expect(statements).toBe(3);
    await storeLines(db, [heard("m3", at + 3)]);
    expect(rows(db).map(({ minute, n }) => ({ minute, n }))).toEqual([
      { minute: at / MINUTE, n: 4 },
      { minute: at / MINUTE + 1, n: 1 },
    ]);
    expect(ids(rows(db)[0].lines.split("\n"))).toEqual(["m0", "m1", "m2", "m3"]);
    expect(db.raw.prepare("SELECT channel_id, login FROM channel").all()).toEqual([{ channel_id: "1001", login: "geckotown" }]);
  });

  it("finds a deleted message's id mid-line, as Twitch sorts tags, and keeps a reply that quotes it", async () => {
    const db = testDb();
    const reply = { ...carl, tags: { "reply-parent-msg-id": "m1", "reply-parent-user-id": "2002", "reply-parent-user-login": "tokaytom" } };
    await store(db, heard("m1", at), heard("m2", at + 1, reply));
    await deleteMessage(db, "1001", "m1");
    expect(rows(db).map((row) => [ids(row.lines.split("\n")), row.n])).toEqual([[["m2"], 1]]);

    // Only the reply quotes m1 now: its row is read but not written again.
    let writes = 0;
    const batch = db.batch;
    db.batch = (list) => {
      writes += list.length;
      return batch(list);
    };
    await deleteMessage(db, "1001", "m1");
    expect(writes).toBe(0);

    // A timeout takes that user's lines, not replies that mention them.
    await store(db, heard("m3", at + 2));
    await clearUserMessages(db, "1001", "2002");
    expect(rows(db).flatMap((row) => ids(row.lines.split("\n")))).toEqual(["m2"]);

    await clearChannel(db, "1001");
    expect(rows(db)).toEqual([]);
  });

  it("the cron drops anything older than 24 hours", async () => {
    const db = testDb();
    await store(db, heard("old", Date.now() - 25 * HOUR), heard("new", at));
    await dropExpired(db);
    expect(rows(db).map((row) => row.minute)).toEqual([at / MINUTE]);
  });
});

describe("read API", () => {
  it("needs the read token, and says which channels it doesn't record", async () => {
    const { env } = setup();
    await store(env.DB, heard("m1", Date.now()));
    expect((await read(env, "/api/v2/recent-messages/geckotown", {})).status).toBe(401);
    expect((await read(env, "/api/v2/recent-messages/geckotown", { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await read(env, "/api/v2/recent-messages/geckotown", { Authorization: "Bearer test-read-tokem" })).status).toBe(401);
    const unknown = await read(env, "/api/v2/recent-messages/somebodyelse");
    expect([unknown.status, unknown.body.error_code]).toEqual([404, "channel_not_joined"]);
  });

  it("returns lines oldest to newest, once each, honouring after, before, limit and the 24-hour window", async () => {
    const { env } = setup();
    const now = Date.now();
    await store(env.DB, heard("m1", now - 3000), heard("m2", now - 2000), heard("m3", now - 1000));
    // m2 written twice (a write D1 took but never confirmed, then tried again), and a line too old to keep.
    await store(env.DB, heard("m2", now - 1500), heard("m0", now - 25 * HOUR));

    const all = await read(env, "/api/v2/recent-messages/GeckoTown");
    expect([all.status, all.body.error_code, ids(all.body.messages)]).toEqual([200, null, ["m1", "m2", "m3"]]);
    expect(all.body.messages[0]).toBe(privmsg("m1", now - 3000, "m1"));
    expect(ids((await read(env, "/api/v2/recent-messages/geckotown?limit=2")).body.messages)).toEqual(["m2", "m3"]);
    expect(ids((await read(env, `/api/v2/recent-messages/geckotown?after=${now - 3000}`)).body.messages)).toEqual(["m2", "m3"]);
    expect(ids((await read(env, `/api/v2/recent-messages/geckotown?before=${now - 1000}`)).body.messages)).toEqual(["m1", "m2"]);
  });

  it("reads only the newest minutes a page needs, and pages back exactly with before", async () => {
    const { env } = setup();
    const start = Date.now() - 3 * HOUR;
    const all: Heard[] = [];
    for (let minute = 0; minute < 120; minute++) {
      for (let i = 0; i < 20; i++) all.push(heard(`m${minute}-${i}`, start + minute * MINUTE + i * 1000));
    }
    await store(env.DB, ...all);
    const allIds = all.map((item) => tagOf(item.line, "id"));
    // Count the lines SQLite hands back, as D1 would send them to the Worker.
    let handed = 0;
    const prepare = env.DB.prepare;
    env.DB.prepare = (sql: string) => ({
      bind: (...values: unknown[]) => {
        const statement = prepare(sql).bind(...values);
        return {
          ...statement,
          all: async <T,>() => {
            const out = await statement.all<T>();
            for (const row of out.results as { lines?: string }[]) handed += row.lines ? row.lines.split("\n").length : 0;
            return out;
          },
        };
      },
    });

    const newest = await read(env, "/api/v2/recent-messages/geckotown?limit=50");
    expect(ids(newest.body.messages)).toEqual(allIds.slice(-50));
    expect(handed).toBeLessThanOrEqual(50 + 20);

    const oldestTs = Number(tagOf(newest.body.messages[0], "tmi-sent-ts"));
    const older = await read(env, `/api/v2/recent-messages/geckotown?limit=50&before=${oldestTs + 1}`);
    expect(ids(older.body.messages)).toEqual(allIds.slice(-99, -49));
  });

  it("still fills a page when repeated copies crowd the newest minute", async () => {
    const { env } = setup();
    const now = Date.now();
    const at = (minutesAgo: number, second: number) => Math.floor((now - minutesAgo * MINUTE) / MINUTE) * MINUTE + second * 1000;
    for (let i = 0; i < 5; i++) await store(env.DB, heard(`old${i}`, at(5, i)));
    // The newest minute: three messages, each stored twice.
    for (const copy of [0, 1]) {
      for (let i = 0; i < 3; i++) await store(env.DB, heard(`new${i}`, at(1, i * 2 + copy)));
    }
    const page = await read(env, "/api/v2/recent-messages/geckotown?limit=6");
    expect(ids(page.body.messages)).toEqual(["old2", "old3", "old4", "new0", "new1", "new2"]);
    // The oldest copy of each repeated message is the one kept.
    expect(page.body.messages.slice(3).map((line) => Number(tagOf(line, "tmi-sent-ts")))).toEqual([at(1, 0), at(1, 2), at(1, 4)]);
  });

  it("has the recorder write what it holds before a first page, but not before older pages", async () => {
    const { env, calls, failFlush } = setup();
    await store(env.DB, heard("m1", Date.now()));
    await read(env, `/api/v2/recent-messages/geckotown?after=${Date.now() - HOUR}`);
    expect(calls).toEqual(["get id:main", "flush"]);
    await read(env, `/api/v2/recent-messages/geckotown?before=${Date.now()}`);
    expect(calls).toHaveLength(2);
    // A recorder that can't be reached doesn't stop the read.
    failFlush();
    const page = await read(env, "/api/v2/recent-messages/geckotown");
    expect([page.status, ids(page.body.messages)]).toEqual([200, ["m1"]]);
    // A wrong token never reaches the recorder.
    await read(env, "/api/v2/recent-messages/geckotown", {});
    expect(calls).toHaveLength(4);
  });

  it("shows the recorder's state to the token holder, which also starts it", async () => {
    const { env, calls } = setup();
    const status = (headers: Record<string, string>) => worker.fetch(new Request("https://logger.test/status", { headers }), env);
    expect((await status({})).status).toBe(401);
    expect(calls).toEqual([]);
    const ok = await status({ Authorization: `Bearer ${TOKEN}` });
    expect([ok.status, await ok.json()]).toEqual([200, { state: "connected" }]);
    expect(calls).toEqual(["get id:main", "start"]);
  });

  it("the cron drops old chat and starts the recorder", async () => {
    const { env, calls } = setup();
    await store(env.DB, heard("old", Date.now() - 25 * HOUR));
    await worker.scheduled(undefined, env);
    expect(rows(env.DB)).toEqual([]);
    expect(calls).toEqual(["get id:main", "start"]);
  });

  it("lets only ZooChattr's page read across origins, and has no public pages", async () => {
    const { env } = setup();
    const ask = (origin: string) =>
      worker.fetch(new Request("https://logger.test/api/v2/recent-messages/geckotown", { method: "OPTIONS", headers: { Origin: origin } }), env);
    const ours = await ask("http://tauri.localhost");
    expect([ours.status, ours.headers.get("Access-Control-Allow-Origin"), ours.headers.get("Access-Control-Allow-Headers")]).toEqual([204, "http://tauri.localhost", "Authorization"]);
    expect((await ask("https://example.com")).status).toBe(403);
    expect((await worker.fetch(new Request("https://logger.test/"), env)).status).toBe(404);
    expect((await worker.fetch(new Request("https://logger.test/eventsub", { method: "POST", body: "{}" }), env)).status).toBe(404);
  });
});
