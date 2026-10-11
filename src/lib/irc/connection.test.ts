import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IrcConnection, backoffDelay, type ConnectionStatus } from "./connection";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(...lines: string[]) {
    this.onmessage?.({ data: `${lines.join("\r\n")}\r\n` });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  get joins() {
    return this.sent.filter((s) => s.startsWith("JOIN"));
  }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1];

function setup(overrides: Partial<ConstructorParameters<typeof IrcConnection>[0]> = {}) {
  const statuses: ConnectionStatus[] = [];
  const commands: string[] = [];
  const conn = new IrcConnection({
    url: "wss://irc.test",
    name: "test",
    getCredentials: async () => ({ nick: "gecko", pass: "oauth:abc" }),
    onMessage: (m) => commands.push(m.command),
    onStatus: (s) => statuses.push(s),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    ...overrides,
  });
  return { conn, statuses, commands };
}

async function connect(conn: IrcConnection) {
  conn.start();
  await vi.advanceTimersByTimeAsync(0);
  const socket = last();
  socket.open();
  socket.receive(":tmi.twitch.tv 001 gecko :Welcome, GLHF!");
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IrcConnection", () => {
  it("logs in with one IRC line per frame and joins only after the welcome", async () => {
    const { conn } = setup();
    conn.join("xqc");
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = last();
    socket.open();
    expect(socket.sent).toEqual([
      "CAP REQ :twitch.tv/tags twitch.tv/commands\r\n",
      "PASS oauth:abc\r\n",
      "NICK gecko\r\n",
    ]);
    socket.receive(":tmi.twitch.tv 001 gecko :Welcome, GLHF!");
    expect(socket.joins).toEqual(["JOIN #xqc\r\n"]);
    expect(conn.status).toBe("connected");
  });

  it("answers server PINGs", async () => {
    const { conn } = setup();
    const socket = await connect(conn);
    socket.receive("PING :tmi.twitch.tv");
    expect(socket.sent.at(-1)).toBe("PONG :tmi.twitch.tv\r\n");
  });

  it("reconnects with backoff after a drop and rejoins channels", async () => {
    const { conn, statuses } = setup();
    conn.join("xqc");
    conn.join("summit1g");
    const first = await connect(conn);
    first.drop();
    expect(conn.status).toBe("reconnecting");
    expect(FakeSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_100);
    expect(FakeSocket.instances).toHaveLength(2);
    const second = last();
    second.open();
    second.receive(":tmi.twitch.tv 001 gecko :Welcome, GLHF!");
    expect(second.joins).toEqual(["JOIN #xqc\r\n", "JOIN #summit1g\r\n"]);
    expect(statuses).toContain("reconnecting");
    expect(statuses.at(-1)).toBe("connected");
  });

  it("reconnects right away when Twitch sends RECONNECT", async () => {
    const { conn } = setup();
    const socket = await connect(conn);
    socket.receive(":tmi.twitch.tv RECONNECT");
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("stops and reports auth failures instead of looping", async () => {
    const { conn, statuses } = setup();
    conn.start();
    await vi.advanceTimersByTimeAsync(0);
    const socket = last();
    socket.open();
    socket.receive(":tmi.twitch.tv NOTICE * :Login authentication failed");
    expect(conn.status).toBe("auth_failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe("auth_failed");
  });

  it("treats a missing PONG as a dead connection", async () => {
    const { conn } = setup({ keepaliveMs: 1_000, pongTimeoutMs: 500 });
    const socket = await connect(conn);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent.at(-1)).toBe("PING :zoochattr\r\n");
    await vi.advanceTimersByTimeAsync(600);
    expect(conn.status).toBe("reconnecting");
  });

  it("keeps the connection when PONG arrives", async () => {
    const { conn } = setup({ keepaliveMs: 1_000, pongTimeoutMs: 500 });
    const socket = await connect(conn);
    await vi.advanceTimersByTimeAsync(1_000);
    socket.receive(":tmi.twitch.tv PONG tmi.twitch.tv :zoochattr");
    await vi.advanceTimersByTimeAsync(600);
    expect(conn.status).toBe("connected");
  });

  it("spreads JOINs to respect Twitch's rate limit", async () => {
    const { conn } = setup({ joinBudget: { count: 3, windowMs: 1_000 } });
    for (const c of ["a1", "a2", "a3", "a4", "a5"]) conn.join(c);
    const socket = await connect(conn);
    expect(socket.joins).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(socket.joins).toHaveLength(5);
  });

  it("forgets parted channels on reconnect", async () => {
    const { conn } = setup();
    conn.join("keep");
    conn.join("gone");
    const first = await connect(conn);
    first.receive(":gecko!gecko@gecko.tmi.twitch.tv JOIN #gone");
    conn.part("gone");
    expect(first.sent.at(-1)).toBe("PART #gone\r\n");
    first.drop();
    await vi.advanceTimersByTimeAsync(1_100);
    const second = last();
    second.open();
    second.receive(":tmi.twitch.tv 001 gecko :Welcome, GLHF!");
    expect(second.joins).toEqual(["JOIN #keep\r\n"]);
  });

  it("can skip the backoff wait", async () => {
    const { conn } = setup();
    const socket = await connect(conn);
    socket.drop();
    conn.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});

describe("backoffDelay", () => {
  it("doubles up to 30s with jitter in [base/2, base]", () => {
    expect(backoffDelay(1, () => 0)).toBe(500);
    expect(backoffDelay(1, () => 1)).toBe(1_000);
    expect(backoffDelay(3, () => 1)).toBe(4_000);
    expect(backoffDelay(20, () => 1)).toBe(30_000);
  });
});
