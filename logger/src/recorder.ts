import { DurableObject } from "cloudflare:workers";
import { ChatReader, channelList, type ReaderStatus, type Socket } from "./reader";
import type { Env } from "./worker";

/** The alarm wakes the recorder this often: it restarts after a deploy or eviction, and checks the socket. */
const CHECK_EVERY_MS = 60_000;

/** Workers open a client WebSocket with an Upgrade fetch; Twitch's chat socket is irc-ws.chat.twitch.tv. */
export async function connectToTwitch(): Promise<Socket> {
  const response = await fetch("https://irc-ws.chat.twitch.tv", { headers: { Upgrade: "websocket" } });
  const socket = (response as Response & { webSocket?: (Socket & { accept(): void }) | null }).webSocket;
  if (!socket) throw new Error(`Twitch answered ${response.status} instead of opening a WebSocket`);
  socket.accept();
  return socket;
}

/**
 * The one always-on object that reads every recorded channel's chat and writes it to D1. Holding a
 * socket keeps it from hibernating, so it's billed all day: the Worker uses exactly one, "main".
 */
export class ChatRecorder extends DurableObject<Env> {
  private readonly reader: ChatReader;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.reader = new ChatReader({ db: env.DB, channels: channelList(env.CHANNELS), connect: connectToTwitch });
  }

  /** Starts reading unless it already is, and keeps the alarm armed. The cron and the Worker call this. */
  async start(): Promise<ReaderStatus> {
    this.reader.start();
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + CHECK_EVERY_MS);
    return this.reader.status();
  }

  /** Writes the held lines now, so a read right after sees everything heard so far. */
  async flush(): Promise<ReaderStatus> {
    await this.start();
    await this.reader.flush();
    return this.reader.status();
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + CHECK_EVERY_MS);
    this.reader.check();
    await this.reader.flush();
  }
}
