import { clearChannel, clearUserMessages, deleteMessage, isFromUser, isMessage, storeLines, tagOf, type Db, type Heard } from "./store";

/** The parts of a WebSocket the reader uses: the Workers client socket after accept(), or a test fake. */
export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code?: number }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export interface ReaderOptions {
  db: Db;
  /** Channel logins to read. */
  channels: readonly string[];
  /** Opens a socket to Twitch IRC, ready to send. */
  connect: () => Promise<Socket>;
  random?: () => number;
}

export interface ReaderStatus {
  /** "connected" once Twitch has welcomed the reader; "waiting" between attempts. */
  state: "stopped" | "connecting" | "connected" | "waiting";
  channels: string[];
  joined: string[];
  connectedSince: number | null;
  /** Twitch's send time of the newest chat line heard. */
  lastLineAt: number | null;
  /** Lines written to D1 since this object started. */
  stored: number;
  /** Lines and removals not written yet. */
  held: number;
  /** Lines given up while D1 refused writes. */
  dropped: number;
  reconnects: number;
  /** The newest connection or write problem, kept after it clears. */
  problem: string | null;
}

/** Each write costs D1 one row per channel and minute it holds (100,000 rows a day on the free plan). */
export const FLUSH_MS = 10_000;
/** Silent this long: ping. Twitch itself pings about every 5 minutes; busy chat is never silent. */
const PING_AFTER_MS = 45_000;
const DEAD_AFTER_MS = 135_000;
const CONNECT_TIMEOUT_MS = 60_000;
/** Twitch allows 20 JOINs per 10 seconds. */
const JOIN_BATCH = 15;
const JOIN_GAP_MS = 11_000;
/** While D1 refuses writes (say, past the daily limit), at most this many lines and removals wait in memory. */
const MAX_HELD = 20_000;

type Removal =
  | { kind: "message"; channelId: string; messageId: string }
  | { kind: "user"; channelId: string; userId: string }
  | { kind: "chat"; channelId: string };
type HeldLine = Heard & { kind: "line" };
/** `storedOnly`: a retried removal that already took the held lines it applies to. */
type Held = HeldLine | (Removal & { storedOnly?: boolean });

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
  return Math.round(base / 2 + random() * (base / 2));
}

/** CHANNELS as logins: comma- or space-separated, "#" and case ignored, repeats dropped. */
export function channelList(text: string | undefined): string[] {
  const logins = (text ?? "")
    .split(/[\s,]+/)
    .map((item) => item.replace(/^#/, "").toLowerCase())
    .filter((item) => /^[a-z0-9_]{1,25}$/.test(item));
  return [...new Set(logins)];
}

/** Command, channel (`#x` → `x`) and trailing text of a raw line. Tags stay unparsed: see tagOf. */
export function splitLine(line: string): { command: string; channel: string; text: string } {
  let rest = line;
  if (rest.startsWith("@")) rest = rest.slice(rest.indexOf(" ") + 1);
  if (rest.startsWith(":")) rest = rest.slice(rest.indexOf(" ") + 1);
  const colon = rest.indexOf(" :");
  const [command = "", target = ""] = (colon < 0 ? rest : rest.slice(0, colon)).split(" ");
  return { command: command.toUpperCase(), channel: target.replace(/^#/, "").toLowerCase(), text: colon < 0 ? "" : rest.slice(colon + 2) };
}

function takes(removal: Removal, heard: Heard): boolean {
  if (heard.channelId !== removal.channelId) return false;
  switch (removal.kind) {
    case "message":
      return isMessage(heard.line, removal.messageId);
    case "user":
      return isFromUser(heard.line, removal.userId);
    case "chat":
      return true;
  }
}

function applyRemoval(db: Db, removal: Removal): Promise<void> {
  switch (removal.kind) {
    case "message":
      return deleteMessage(db, removal.channelId, removal.messageId);
    case "user":
      return clearUserMessages(db, removal.channelId, removal.userId);
    case "chat":
      return clearChannel(db, removal.channelId);
  }
}

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function closeQuietly(socket: Socket): void {
  try {
    socket.close(1000, "done");
  } catch {
    // already closed
  }
}

/**
 * Reads the channels' chat anonymously over Twitch IRC (no app, token or permissions), and writes
 * each line, delete, timeout and clear to D1. Lines are held for up to FLUSH_MS and written together.
 */
export class ChatReader {
  private socket: Socket | null = null;
  private state: ReaderStatus["state"] = "stopped";
  /** Bumped whenever a socket is let go, so its late events are ignored. */
  private generation = 0;
  private attempt = 0;
  private openedAt = 0;
  private lastSeen = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly joined = new Set<string>();
  /** login → room id, from ROOMSTATE (sent on every join) and chat lines. */
  private readonly rooms = new Map<string, string>();
  /** Room ids this object has put in the channel table. */
  private readonly remembered = new Set<string>();
  /** Lines and removals in the order Twitch sent them, not yet written. */
  private held: Held[] = [];
  private writing: Promise<void> = Promise.resolve();
  private connectedSince: number | null = null;
  private lastLineAt: number | null = null;
  private stored = 0;
  private dropped = 0;
  private reconnects = 0;
  private problem: string | null = null;

  constructor(private readonly options: ReaderOptions) {}

  /** Connects unless already connected, connecting or waiting to retry. Safe to call any time. */
  start(): void {
    if (!this.options.channels.length) {
      this.problem = "No channels to read: set CHANNELS.";
      return;
    }
    if (this.state === "stopped") void this.open();
  }

  /** The alarm's check: starts a stopped reader, pings a quiet socket and replaces a dead one. */
  check(now = Date.now()): void {
    if (this.state === "stopped") return this.start();
    if (this.state === "connecting" && now - this.openedAt > CONNECT_TIMEOUT_MS) return this.lose("Twitch didn't welcome the reader in time");
    if (!this.socket) return;
    const silent = now - this.lastSeen;
    if (silent > DEAD_AFTER_MS) this.lose("Twitch stopped answering pings");
    else if (silent > PING_AFTER_MS) this.send("PING :zoochattr");
  }

  /** Writes everything held so far. Writes run one at a time, so a removal never overtakes the line it removes. */
  flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.writing = this.writing.then(() => this.write()).catch((err) => {
      this.problem = `Couldn't write chat: ${reasonOf(err)}`;
    });
    return this.writing;
  }

  status(): ReaderStatus {
    return {
      state: this.state,
      channels: [...this.options.channels],
      joined: [...this.joined].sort(),
      connectedSince: this.connectedSince,
      lastLineAt: this.lastLineAt,
      stored: this.stored,
      held: this.held.length,
      dropped: this.dropped,
      reconnects: this.reconnects,
      problem: this.problem,
    };
  }

  private async open(): Promise<void> {
    const generation = ++this.generation;
    this.state = "connecting";
    this.openedAt = Date.now();
    let socket: Socket;
    try {
      socket = await this.options.connect();
    } catch (err) {
      if (generation === this.generation) this.retry(`Couldn't connect to Twitch: ${reasonOf(err)}`);
      return;
    }
    if (generation !== this.generation) return closeQuietly(socket);
    this.socket = socket;
    this.lastSeen = Date.now();
    socket.addEventListener("message", (event) => {
      if (generation === this.generation) this.receive(String(event.data));
    });
    socket.addEventListener("close", (event) => {
      if (generation === this.generation) this.lose(`Twitch closed the connection (code ${event.code ?? "none"})`);
    });
    socket.addEventListener("error", () => {
      if (generation === this.generation) this.lose("The connection to Twitch failed");
    });
    const nick = `justinfan${10_000 + Math.floor((this.options.random ?? Math.random)() * 90_000)}`;
    this.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    this.send("PASS SCHMOOPIIE");
    this.send(`NICK ${nick}`);
  }

  private send(line: string): void {
    try {
      this.socket?.send(`${line}\r\n`);
    } catch {
      // A close event follows; reconnecting starts there.
    }
  }

  /** Lets the socket go: its late events are ignored and the channels count as not joined. */
  private letGo(): void {
    this.generation++;
    const socket = this.socket;
    this.socket = null;
    this.joined.clear();
    this.connectedSince = null;
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.joinTimer = null;
    if (socket) closeQuietly(socket);
  }

  private lose(reason: string): void {
    this.reconnects++;
    this.letGo();
    this.retry(reason);
  }

  private retry(reason: string): void {
    this.problem = reason;
    this.state = "waiting";
    this.attempt++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, backoffDelay(this.attempt, this.options.random));
  }

  /** One frame can hold several lines. All of them count, even those after a RECONNECT: Twitch did send them. */
  private receive(data: string): void {
    this.lastSeen = Date.now();
    for (const line of data.split("\r\n")) if (line) this.handle(line);
  }

  private handle(line: string): void {
    const { command, channel, text } = splitLine(line);
    switch (command) {
      case "PING":
        this.send(`PONG :${text || "tmi.twitch.tv"}`);
        return;
      case "001":
        this.state = "connected";
        this.attempt = 0;
        this.connectedSince = Date.now();
        this.joinFrom(0);
        return;
      case "RECONNECT":
        // Twitch is about to restart this server: move now rather than wait out a backoff.
        this.reconnects++;
        this.problem = "Twitch asked for a reconnect";
        this.letGo();
        this.attempt = 0;
        void this.open();
        return;
      case "JOIN":
        // Without the membership capability, Twitch only reports the reader's own joins and parts.
        this.joined.add(channel);
        return;
      case "PART":
        this.joined.delete(channel);
        return;
      case "ROOMSTATE":
        this.roomOf(line, channel);
        return;
      case "PRIVMSG": {
        const id = tagOf(line, "id");
        const ts = Number(tagOf(line, "tmi-sent-ts"));
        const channelId = this.roomOf(line, channel);
        if (!id || !channelId || !(ts > 0)) return;
        this.lastLineAt = ts;
        this.hold({ kind: "line", channelId, line, ts });
        return;
      }
      case "CLEARMSG": {
        const messageId = tagOf(line, "target-msg-id");
        const channelId = this.roomOf(line, channel);
        if (messageId && channelId) this.hold({ kind: "message", channelId, messageId });
        return;
      }
      case "CLEARCHAT": {
        const userId = tagOf(line, "target-user-id");
        const channelId = this.roomOf(line, channel);
        if (channelId) this.hold(userId ? { kind: "user", channelId, userId } : { kind: "chat", channelId });
        return;
      }
      case "NOTICE":
        // An anonymous reader only gets notices when something is wrong, like a suspended channel.
        this.problem = `Twitch notice for #${channel}: ${text}`;
        console.log(this.problem);
        return;
    }
  }

  private joinFrom(start: number): void {
    const channels = this.options.channels;
    const generation = this.generation;
    this.send(`JOIN ${channels.slice(start, start + JOIN_BATCH).map((login) => `#${login}`).join(",")}`);
    if (start + JOIN_BATCH >= channels.length) return;
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (generation === this.generation) this.joinFrom(start + JOIN_BATCH);
    }, JOIN_GAP_MS);
  }

  /**
   * The channel's room id: from the line's tag, else from an earlier ROOMSTATE (Twitch can send
   * CLEARMSG with an empty room-id). A new channel is written to the channel table at the next flush,
   * so a quiet channel reads as recorded rather than unknown.
   */
  private roomOf(line: string, channel: string): string | undefined {
    const room = tagOf(line, "room-id") || this.rooms.get(channel);
    if (room && channel && this.rooms.get(channel) !== room) {
      this.rooms.set(channel, room);
      if (!this.remembered.has(room)) this.soon();
    }
    return room;
  }

  private hold(item: Held): void {
    this.held.push(item);
    if (this.held.length > MAX_HELD) {
      const gone = this.held.splice(0, this.held.length - MAX_HELD);
      this.dropped += gone.filter((entry) => entry.kind === "line").length;
    }
    this.soon();
  }

  private soon(): void {
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_MS);
  }

  /** Never throws: anything D1 refused goes back to be tried at the next flush. */
  private async write(): Promise<void> {
    const { db } = this.options;
    const items = this.held.splice(0);
    let lines: HeldLine[] = [];
    const retry: Held[] = [];
    for (const item of items) {
      if (item.kind === "line") {
        lines.push(item);
        continue;
      }
      // Every line held so far was said before this removal, so it takes them too. D1 has the older ones.
      if (!item.storedOnly) lines = lines.filter((heard) => !takes(item, heard));
      try {
        await applyRemoval(db, item);
      } catch (err) {
        retry.push({ ...item, storedOnly: true });
        this.problem = `Couldn't remove deleted chat: ${reasonOf(err)}`;
      }
    }
    const channels = [...this.rooms].filter(([, room]) => !this.remembered.has(room)).map(([login, room]) => [room, login] as const);
    try {
      await storeLines(db, lines, channels);
      for (const [room] of channels) this.remembered.add(room);
      this.stored += lines.length;
    } catch (err) {
      retry.push(...lines);
      this.problem = `Couldn't write chat: ${reasonOf(err)}`;
    }
    if (retry.length) this.held = [...retry, ...this.held];
  }
}
