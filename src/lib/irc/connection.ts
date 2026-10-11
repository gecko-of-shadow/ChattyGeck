import { channelFromParam, parseIrcLine, type IrcMessage } from "./parser";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_failed"
  | "closed";

export interface ConnectionDetail {
  /** When reconnecting: milliseconds until the next attempt. */
  retryInMs?: number;
  attempt?: number;
  reason?: string;
}

export interface Credentials {
  nick: string;
  /** `oauth:<token>`; omitted for anonymous (justinfan) logins. */
  pass?: string;
}

export interface IrcConnectionOptions {
  url: string;
  name: string;
  getCredentials: () => Promise<Credentials>;
  onMessage: (message: IrcMessage) => void;
  onStatus: (status: ConnectionStatus, detail: ConnectionDetail) => void;
  /** Join channels after connecting. The write connection doesn't need to. */
  joinChannels?: boolean;
  WebSocketImpl?: typeof WebSocket;
  /** Twitch allows 20 JOINs per 10s; stay comfortably under it. */
  joinBudget?: { count: number; windowMs: number };
  keepaliveMs?: number;
  pongTimeoutMs?: number;
}

const AUTH_FAILURE = /login authentication failed|improperly formatted auth|invalid nick/i;

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 5));
  return Math.round(base / 2 + random() * (base / 2));
}

export class IrcConnection {
  private ws: WebSocket | null = null;
  private readonly wanted = new Set<string>();
  private readonly joined = new Set<string>();
  private joinQueue: string[] = [];
  private joinHistory: number[] = [];
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private generation = 0;
  private stopped = true;
  private nick = "";
  private _status: ConnectionStatus = "idle";

  constructor(private readonly opts: IrcConnectionOptions) {}

  get status(): ConnectionStatus {
    return this._status;
  }

  get currentNick(): string {
    return this.nick;
  }

  isJoined(channel: string): boolean {
    return this.joined.has(channel);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.clearTimers();
    this.joined.clear();
    this.joinQueue = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onopen = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
    this.setStatus("closed", {});
  }

  /** Drops the socket and reconnects right away (credentials are re-read). */
  restart(reason = "Restarting connection"): void {
    this.stop();
    this.stopped = false;
    this.attempt = 0;
    void this.open(reason);
  }

  /** Skips the remaining backoff wait, e.g. when the OS reports the network is back. */
  retryNow(): void {
    if (this.stopped || this._status !== "reconnecting") return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    void this.open();
  }

  join(channel: string): void {
    if (this.wanted.has(channel)) return;
    this.wanted.add(channel);
    if (this._status === "connected" && this.opts.joinChannels !== false) this.enqueueJoin(channel);
  }

  part(channel: string): void {
    this.wanted.delete(channel);
    this.joinQueue = this.joinQueue.filter((c) => c !== channel);
    if (this.joined.has(channel)) {
      this.joined.delete(channel);
      this.sendRaw(`PART #${channel}`);
    }
  }

  sendRaw(line: string): boolean {
    if (!this.ws || this.ws.readyState !== 1 || this._status !== "connected") return false;
    this.ws.send(`${line}\r\n`);
    return true;
  }

  privmsg(channel: string, text: string): boolean {
    return this.sendRaw(`PRIVMSG #${channel} :${text}`);
  }

  private setStatus(status: ConnectionStatus, detail: ConnectionDetail): void {
    this._status = status;
    this.opts.onStatus(status, detail);
  }

  private clearTimers(): void {
    if (this.joinTimer) clearTimeout(this.joinTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.joinTimer = this.reconnectTimer = this.keepaliveTimer = this.pongTimer = null;
  }

  private async open(reason?: string): Promise<void> {
    const generation = ++this.generation;
    this.clearTimers();
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting", {
      attempt: this.attempt,
      reason,
    });

    let credentials: Credentials;
    try {
      credentials = await this.opts.getCredentials();
    } catch (err) {
      if (generation !== this.generation || this.stopped) return;
      this.scheduleReconnect(err instanceof Error ? err.message : "Couldn't prepare login");
      return;
    }
    if (generation !== this.generation || this.stopped) return;

    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    let ws: WebSocket;
    try {
      ws = new Impl(this.opts.url);
    } catch (err) {
      this.scheduleReconnect(err instanceof Error ? err.message : "Couldn't open socket");
      return;
    }
    this.ws = ws;
    this.nick = credentials.nick.toLowerCase();

    ws.onopen = () => {
      if (generation !== this.generation) return;
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
      ws.send(`PASS ${credentials.pass ?? "SCHMOOPIIE"}\r\n`);
      ws.send(`NICK ${credentials.nick}\r\n`);
    };
    ws.onmessage = (event) => {
      if (generation !== this.generation) return;
      const data = typeof event.data === "string" ? event.data : String(event.data);
      for (const line of data.split("\r\n")) {
        if (line) this.handleLine(line);
        if (generation !== this.generation) return;
      }
    };
    ws.onerror = () => {
      // A close event always follows; reconnect handling lives there.
    };
    ws.onclose = (event) => {
      if (generation !== this.generation) return;
      this.ws = null;
      this.joined.clear();
      this.clearTimers();
      if (this.stopped || this._status === "auth_failed") return;
      this.scheduleReconnect(event.code === 1000 ? "Connection closed" : `Connection lost (code ${event.code})`);
    };
  }

  private handleLine(line: string): void {
    const message = parseIrcLine(line);
    if (!message) return;

    switch (message.command) {
      case "PING":
        this.ws?.send(`PONG :${message.params[0] ?? "tmi.twitch.tv"}\r\n`);
        return;
      case "PONG":
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case "001":
        this.attempt = 0;
        this.setStatus("connected", {});
        this.startKeepalive();
        if (this.opts.joinChannels !== false) {
          this.joinQueue = [];
          for (const channel of this.wanted) this.enqueueJoin(channel);
        }
        break;
      case "RECONNECT":
        this.forceReconnect("Twitch asked ChatDeck to reconnect");
        return;
      case "NOTICE":
        if (message.params[0] === "*" && AUTH_FAILURE.test(message.params[1] ?? "")) {
          this.failAuth(message.params[1] ?? "Login authentication failed");
          return;
        }
        break;
      case "JOIN":
        if (message.nick?.toLowerCase() === this.nick) this.joined.add(channelFromParam(message.params[0]));
        break;
      case "PART":
        if (message.nick?.toLowerCase() === this.nick) this.joined.delete(channelFromParam(message.params[0]));
        break;
    }

    this.opts.onMessage(message);
  }

  private failAuth(reason: string): void {
    this.generation++;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.joined.clear();
    this.setStatus("auth_failed", { reason });
  }

  private forceReconnect(reason: string): void {
    const ws = this.ws;
    this.generation++;
    this.ws = null;
    this.joined.clear();
    this.clearTimers();
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.attempt = 0;
    void this.open(reason);
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    this.attempt++;
    const delay = backoffDelay(this.attempt);
    this.setStatus("reconnecting", { retryInMs: delay, attempt: this.attempt, reason });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open(reason);
    }, delay);
  }

  private startKeepalive(): void {
    const every = this.opts.keepaliveMs ?? 60_000;
    const timeout = this.opts.pongTimeoutMs ?? 10_000;
    this.keepaliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== 1) return;
      this.ws.send("PING :chatdeck\r\n");
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        const ws = this.ws;
        this.generation++;
        this.ws = null;
        this.joined.clear();
        this.clearTimers();
        if (ws) {
          ws.onclose = null;
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
        this.scheduleReconnect("Twitch stopped answering pings");
      }, timeout);
    }, every);
  }

  private enqueueJoin(channel: string): void {
    if (!this.joinQueue.includes(channel)) this.joinQueue.push(channel);
    this.pumpJoins();
  }

  private pumpJoins(): void {
    if (this.joinTimer) return;
    const budget = this.opts.joinBudget ?? { count: 15, windowMs: 10_500 };
    const now = Date.now();
    this.joinHistory = this.joinHistory.filter((t) => now - t < budget.windowMs);

    while (this.joinQueue.length && this.joinHistory.length < budget.count) {
      const channel = this.joinQueue.shift()!;
      if (!this.wanted.has(channel)) continue;
      if (this.sendRaw(`JOIN #${channel}`)) this.joinHistory.push(Date.now());
    }

    if (this.joinQueue.length) {
      const wait = budget.windowMs - (now - this.joinHistory[0]) + 50;
      this.joinTimer = setTimeout(() => {
        this.joinTimer = null;
        this.pumpJoins();
      }, Math.max(wait, 100));
    }
  }
}
