import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseIrcLine } from "@/lib/irc/parser";
import { privmsgToChat } from "@/lib/twitch/messages";
import { ChatReader, FLUSH_MS, channelList, splitLine, type Socket } from "./reader";
import { ChatRecorder } from "./recorder";
import { recentLines, tagOf } from "./store";
import { testDb } from "./test-db";
import { FakeSocket, privmsg, roomstate } from "./test-twitch";

const START = Date.UTC(2026, 9, 20, 21, 0, 0);
/** A Twitch send time this many seconds into the test's minute. */
const at = (seconds: number) => START + seconds * 1000;
const WELCOME = ":tmi.twitch.tv 001 justinfan55000 :Welcome, GLHF!";
const joined = (channel: string) => `:justinfan55000!justinfan55000@justinfan55000.tmi.twitch.tv JOIN #${channel}`;
const carl = { login: "crestedcarl", userId: "3003" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 30_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(channels = ["geckotown", "leopardlily"], connect?: () => Promise<Socket>) {
  const db = testDb();
  const sockets: FakeSocket[] = [];
  const reader = new ChatReader({
    db,
    channels,
    connect:
      connect ??
      (async () => {
        sockets.push(new FakeSocket());
        return sockets[sockets.length - 1];
      }),
    random: () => 0.5,
  });
  return { db, reader, sockets, socket: () => sockets[sockets.length - 1] };
}

/** Started, welcomed, and in both channels. */
async function connected() {
  const t = setup();
  t.reader.start();
  await vi.advanceTimersByTimeAsync(0);
  t.socket().receive(WELCOME, joined("geckotown"), roomstate("geckotown", "1001"), joined("leopardlily"), roomstate("leopardlily", "1002"));
  return t;
}

const read = (db: ReturnType<typeof testDb>, login: string) => recentLines(db, login, { limit: 800, now: Date.now() });
const ids = (lines: string[] | null) => (lines ?? []).map((line) => tagOf(line, "id"));

describe("reading Twitch chat", () => {
  it("logs in anonymously, and joins every channel once Twitch welcomes it", async () => {
    const t = setup();
    t.reader.start();
    t.reader.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sockets).toHaveLength(1);
    expect(t.socket().lines).toEqual(["CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS SCHMOOPIIE", "NICK justinfan55000"]);
    t.socket().receive(":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands", WELCOME, ":tmi.twitch.tv 376 justinfan55000 :>");
    expect(t.socket().lines.at(-1)).toBe("JOIN #geckotown,#leopardlily");
    t.socket().receive(joined("geckotown"), roomstate("geckotown", "1001"));
    expect(t.reader.status()).toMatchObject({ state: "connected", joined: ["geckotown"], channels: ["geckotown", "leopardlily"] });
    t.socket().receive("PING :tmi.twitch.tv");
    expect(t.socket().lines.at(-1)).toBe("PONG :tmi.twitch.tv");
  });

  it("joins at most 15 channels per 11 seconds, under Twitch's join limit", async () => {
    const channels = Array.from({ length: 20 }, (_, i) => `gecko${i}`);
    const t = setup(channels);
    t.reader.start();
    await vi.advanceTimersByTimeAsync(0);
    t.socket().receive(WELCOME);
    expect(t.socket().lines.at(-1)).toBe(`JOIN ${channels.slice(0, 15).map((c) => `#${c}`).join(",")}`);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(t.socket().lines.at(-1)).toBe(`JOIN ${channels.slice(15).map((c) => `#${c}`).join(",")}`);
  });

  it("reads CHANNELS as logins, whatever the separators, case or # signs", () => {
    expect(channelList(" #GeckoTown, leopardlily  crestedcarl,leopardlily,not-a-login ")).toEqual(["geckotown", "leopardlily", "crestedcarl"]);
    expect(channelList(undefined)).toEqual([]);
    expect(splitLine("@a=b :x!x@x.tmi.twitch.tv PRIVMSG #Gecko :hi :) there")).toEqual({ command: "PRIVMSG", channel: "gecko", text: "hi :) there" });
  });

  it("writes Twitch's lines as they came, together every few seconds, one row per channel and minute", async () => {
    const t = await connected();
    const gecko = [privmsg("m1", at(1), "one"), privmsg("m2", at(2), "two"), privmsg("m3", at(61), "next minute")];
    t.socket().receive(gecko[0], gecko[1], privmsg("p1", at(3), "hi", { channel: "leopardlily", room: "1002" }));
    t.socket().receive(gecko[2]);
    await vi.advanceTimersByTimeAsync(FLUSH_MS - 1);
    expect(t.db.raw.prepare("SELECT count(*) AS c FROM chat_bucket").get()).toEqual({ c: 0 });
    await vi.advanceTimersByTimeAsync(1);
    const minute = START / 60_000;
    expect(t.db.raw.prepare("SELECT channel_id, minute, n FROM chat_bucket ORDER BY channel_id, minute").all()).toEqual([
      { channel_id: "1001", minute, n: 2 },
      { channel_id: "1001", minute: minute + 1, n: 1 },
      { channel_id: "1002", minute, n: 1 },
    ]);
    vi.setSystemTime(at(62));
    expect(await read(t.db, "geckotown")).toEqual(gecko);
    expect(t.reader.status()).toMatchObject({ stored: 4, held: 0, lastLineAt: at(61) });
  });

  it("a channel nobody has spoken in yet still reads as recorded", async () => {
    const t = await connected();
    await t.reader.flush();
    expect(await read(t.db, "leopardlily")).toEqual([]);
    expect(await read(t.db, "somebodyelse")).toBeNull();
  });

  it("a real reply with emotes, and a /me, read back exactly in ZooChattr", async () => {
    const t = await connected();
    const reply =
      `@badge-info=subscriber/16;badges=moderator/1,subscriber/12;client-nonce=8c0f3e8e1b5b4f2d9a7c6b5a4f3e2d1c;color=#FF8800;display-name=TokayTom;emotes=25:16-20,27-31;first-msg=0;flags=;` +
      `id=b34ccfc7-4977-403a-8a94-33c6bac34fb8;mod=1;reply-parent-display-name=CrestedCarl;reply-parent-msg-body=a\\:\\sb\\sc;reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f;` +
      `reply-parent-user-id=3003;reply-parent-user-login=crestedcarl;reply-thread-parent-display-name=CrestedCarl;reply-thread-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f;` +
      `reply-thread-parent-user-id=3003;reply-thread-parent-user-login=crestedcarl;returning-chatter=0;room-id=1001;subscriber=1;tmi-sent-ts=${at(5)};turbo=0;user-id=2002;user-type=mod ` +
      `:tokaytom!tokaytom@tokaytom.tmi.twitch.tv PRIVMSG #geckotown :@CrestedCarl hi Kappa ;) 🦎 Kappa`;
    t.socket().receive(reply, privmsg("act-1", at(6), "\u0001ACTION waves\u0001"));
    await t.reader.flush();
    const [first, second] = (await read(t.db, "geckotown"))!.map((line) => privmsgToChat(parseIrcLine(line)!));
    expect(first).toMatchObject({
      id: "b34ccfc7-4977-403a-8a94-33c6bac34fb8",
      channel: "geckotown",
      kind: "chat",
      ts: at(5),
      login: "tokaytom",
      userId: "2002",
      displayName: "TokayTom",
      color: "#FF8800",
      text: "@CrestedCarl hi Kappa ;) 🦎 Kappa",
    });
    expect(first.reply).toEqual({ login: "crestedcarl", displayName: "CrestedCarl", text: "a; b c" });
    expect(first.twitchEmotes).toEqual([
      { id: "25", start: 16, end: 20 },
      { id: "25", start: 27, end: 31 },
    ]);
    expect(first.badges[0]).toMatchObject({ setId: "moderator", version: "1" });
    expect(second).toMatchObject({ id: "act-1", kind: "action", text: "waves" });
  });

  it("a delete, timeout or clear takes the line whether it's written yet or still held", async () => {
    const t = await connected();
    t.socket().receive(privmsg("a1", at(1), "written"), privmsg("b1", at(2), "other user", carl));
    await t.reader.flush();
    t.socket().receive(privmsg("a2", at(3), "held"), privmsg("a3", at(4), "held too"), privmsg("b2", at(5), "kept", carl));
    // Twitch documents CLEARMSG with an empty room-id: the ROOMSTATE from the join fills it in.
    t.socket().receive(`@login=tokaytom;room-id=;target-msg-id=a1;tmi-sent-ts=${at(6)} :tmi.twitch.tv CLEARMSG #geckotown :written`);
    t.socket().receive(`@login=tokaytom;room-id=;target-msg-id=a2;tmi-sent-ts=${at(6)} :tmi.twitch.tv CLEARMSG #geckotown :held`);
    await t.reader.flush();
    expect(ids(await read(t.db, "geckotown"))).toEqual(["b1", "a3", "b2"]);

    // A timeout takes everything that user said, written or held, and nobody else's.
    t.socket().receive(privmsg("a4", at(7), "held"));
    t.socket().receive(`@ban-duration=600;room-id=1001;target-user-id=2002;tmi-sent-ts=${at(8)} :tmi.twitch.tv CLEARCHAT #geckotown :tokaytom`);
    await t.reader.flush();
    expect(ids(await read(t.db, "geckotown"))).toEqual(["b1", "b2"]);

    // A cleared chat takes everything said before it in that channel, and nothing said after.
    t.socket().receive(privmsg("p1", at(9), "elsewhere", { channel: "leopardlily", room: "1002" }), privmsg("b3", at(9), "before", carl));
    t.socket().receive(`@room-id=1001;tmi-sent-ts=${at(10)} :tmi.twitch.tv CLEARCHAT #geckotown`, privmsg("b4", at(11), "after", carl));
    await t.reader.flush();
    expect(ids(await read(t.db, "geckotown"))).toEqual(["b4"]);
    expect(ids(await read(t.db, "leopardlily"))).toEqual(["p1"]);
  });

  it("holds on while D1 refuses writes, then writes the lines and removals in order", async () => {
    const t = await connected();
    t.socket().receive(privmsg("m0", at(1), "early"));
    await t.reader.flush();
    const batch = t.db.batch;
    t.db.batch = async () => {
      throw new Error("D1_ERROR: daily write limit");
    };
    t.socket().receive(privmsg("m1", at(2), "held"), `@login=tokaytom;room-id=1001;target-msg-id=m0;tmi-sent-ts=${at(3)} :tmi.twitch.tv CLEARMSG #geckotown :early`);
    await t.reader.flush();
    expect(t.reader.status()).toMatchObject({ stored: 1, held: 2, problem: "Couldn't write chat: D1_ERROR: daily write limit" });
    t.db.batch = batch;
    t.socket().receive(privmsg("m2", at(4), "later"));
    await t.reader.flush();
    expect(ids(await read(t.db, "geckotown"))).toEqual(["m1", "m2"]);
    expect(t.reader.status()).toMatchObject({ stored: 3, held: 0 });
  });
});

describe("staying connected", () => {
  it("reconnects after a drop with backoff, and at once when Twitch asks", async () => {
    const t = await connected();
    t.socket().drop(1006);
    expect(t.reader.status()).toMatchObject({ state: "waiting", joined: [], problem: "Twitch closed the connection (code 1006)" });
    // The first retry waits 0.5-1 s (0.75 s with this test's random).
    await vi.advanceTimersByTimeAsync(749);
    expect(t.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.sockets).toHaveLength(2);
    expect(t.socket().lines.slice(1)).toEqual(["PASS SCHMOOPIIE", "NICK justinfan55000"]);
    t.socket().receive(WELCOME);
    expect(t.socket().lines.at(-1)).toBe("JOIN #geckotown,#leopardlily");

    // RECONNECT: the rest of that frame still counts, and the next socket opens without waiting.
    const old = t.socket();
    old.receive(":tmi.twitch.tv RECONNECT", privmsg("last", at(20), "said just before"));
    expect(old.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sockets).toHaveLength(3);
    old.receive(privmsg("stale", at(21), "a socket already let go"));
    await t.reader.flush();
    expect(ids(await read(t.db, "geckotown"))).toEqual(["last"]);
    expect(t.reader.status()).toMatchObject({ state: "connecting", reconnects: 2, problem: "Twitch asked for a reconnect" });
  });

  it("the alarm's check pings a quiet socket and replaces one that stopped answering", async () => {
    const t = await connected();
    const first = t.socket();
    await vi.advanceTimersByTimeAsync(46_000);
    t.reader.check();
    expect(first.lines.at(-1)).toBe("PING :zoochattr");
    first.receive(":tmi.twitch.tv PONG tmi.twitch.tv :zoochattr");
    await vi.advanceTimersByTimeAsync(60_000);
    t.reader.check();
    await vi.advanceTimersByTimeAsync(60_000);
    t.reader.check();
    expect(first.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(16_000);
    t.reader.check();
    expect(first.closed).toBe(true);
    expect(t.reader.status()).toMatchObject({ state: "waiting", problem: "Twitch stopped answering pings" });
  });

  it("gives up on a connection Twitch never finishes, and tries again", async () => {
    let calls = 0;
    const t = setup(["geckotown"], () => (++calls === 1 ? new Promise<Socket>(() => {}) : Promise.resolve(new FakeSocket())));
    t.reader.start();
    await vi.advanceTimersByTimeAsync(60_000);
    t.reader.check();
    expect(t.reader.status()).toMatchObject({ state: "connecting" });
    await vi.advanceTimersByTimeAsync(1);
    t.reader.check();
    expect(t.reader.status()).toMatchObject({ state: "waiting", problem: "Twitch didn't welcome the reader in time" });
    await vi.advanceTimersByTimeAsync(750);
    expect(calls).toBe(2);
  });

  it("with no channels set, it says so instead of connecting", () => {
    const t = setup([]);
    t.reader.start();
    expect(t.sockets).toHaveLength(0);
    expect(t.reader.status()).toMatchObject({ state: "stopped", problem: "No channels to read: set CHANNELS." });
  });
});

describe("the Durable Object", () => {
  function object(channels: string) {
    let alarm: number | null = null;
    const ctx = {
      storage: {
        getAlarm: async () => alarm,
        setAlarm: async (time: number) => {
          alarm = time;
        },
      },
    };
    const db = testDb();
    const recorder = new ChatRecorder(ctx as never, { DB: db, CHANNELS: channels, READ_TOKEN: "x", RECORDER: null as never });
    return { recorder, db, alarm: () => alarm };
  }

  it("opens Twitch's socket with an Upgrade fetch, keeps its alarm armed, and writes on flush", async () => {
    const socket = new FakeSocket();
    const fetch = vi.fn(async () => ({ status: 101, webSocket: socket }));
    vi.stubGlobal("fetch", fetch);
    const o = object("GeckoTown");
    expect(await o.recorder.start()).toMatchObject({ state: "connecting", channels: ["geckotown"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledWith("https://irc-ws.chat.twitch.tv", { headers: { Upgrade: "websocket" } });
    expect(socket.accepted).toBe(true);
    expect(o.alarm()).toBe(START + 30_000 + 60_000);

    socket.receive(WELCOME, joined("geckotown"), roomstate("geckotown", "1001"), privmsg("m1", at(1), "hi"));
    expect(await o.recorder.flush()).toMatchObject({ state: "connected", joined: ["geckotown"], stored: 1, held: 0 });
    await o.recorder.start();
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await o.recorder.alarm();
    expect(o.alarm()).toBe(START + 30_000 + 120_000);
  });

  it("retries when Twitch won't upgrade to a WebSocket", async () => {
    vi.stubGlobal("fetch", async () => ({ status: 400, webSocket: null }));
    const o = object("geckotown");
    await o.recorder.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(await o.recorder.start()).toMatchObject({ state: "waiting", problem: "Couldn't connect to Twitch: Twitch answered 400 instead of opening a WebSocket" });
  });
});
