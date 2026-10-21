import type { Socket } from "./reader";

/**
 * A chat line shaped exactly like Twitch IRC's: tags sorted by name, so `id` and `user-id` sit
 * mid-line, among the tags real lines carry (client-nonce, flags, returning-chatter, ...).
 */
export function privmsg(
  id: string,
  ts: number,
  text: string,
  options: { channel?: string; room?: string; login?: string; userId?: string; tags?: Record<string, string> } = {},
): string {
  const login = options.login ?? "tokaytom";
  const tags: Record<string, string> = {
    "badge-info": "subscriber/16",
    badges: "subscriber/12,premium/1",
    "client-nonce": "4e0d1f0e8a9b4c3d2e1f0a9b8c7d6e5f",
    color: "#FF8800",
    "display-name": login,
    emotes: "",
    "first-msg": "0",
    flags: "",
    id,
    mod: "0",
    "returning-chatter": "0",
    "room-id": options.room ?? "1001",
    subscriber: "1",
    "tmi-sent-ts": String(ts),
    turbo: "0",
    "user-id": options.userId ?? "2002",
    "user-type": "",
    ...options.tags,
  };
  const tagText = Object.keys(tags)
    .sort()
    .map((key) => `${key}=${tags[key]}`)
    .join(";");
  return `@${tagText} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${options.channel ?? "geckotown"} :${text}`;
}

export const roomstate = (channel: string, room: string) =>
  `@emote-only=0;followers-only=-1;r9k=0;room-id=${room};slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #${channel}`;

/** Twitch's side of a socket: `receive` delivers a frame from Twitch, `lines` is what the reader sent. */
export class FakeSocket implements Socket {
  readonly sent: string[] = [];
  closed = false;
  accepted = false;
  private readonly listeners = new Map<string, ((event: never) => void)[]>();

  accept(): void {
    this.accepted = true;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** One WebSocket frame; Twitch can put several lines in one. */
  receive(...lines: string[]): void {
    this.emit("message", { data: lines.map((line) => `${line}\r\n`).join("") });
  }

  drop(code = 1006): void {
    this.emit("close", { code });
  }

  get lines(): string[] {
    return this.sent.map((line) => line.replace(/\r\n$/, ""));
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
}
