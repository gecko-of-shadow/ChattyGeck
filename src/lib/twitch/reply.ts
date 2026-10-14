/** Twitch message ids we will put in an IRC reply tag. Local rows are not real targets. */
const LOCAL_ID_PREFIX = /^(?:send|msg|event|sys|local)-/;
const SAFE_REPLY_ID = /^[A-Za-z0-9-]{8,80}$/;

/**
 * A parent id safe to place in `@reply-parent-msg-id`.
 * Rejects spaces and other IRC syntax, plus ids this app made up.
 */
export function replyParentMsgId(id: string): string | null {
  if (id.startsWith("hist-boundary")) return null;
  if (LOCAL_ID_PREFIX.test(id)) return null;
  if (!SAFE_REPLY_ID.test(id)) return null;
  return id;
}

const SNIPPET = 80;

/** One short line of the message being answered, for the banner and the optimistic row. */
export function replySnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= SNIPPET) return flat;
  return `${flat.slice(0, SNIPPET - 1)}…`;
}

/** Chat lines Twitch can thread a reply onto. Pending and local rows are still in flight or ours only. */
export function canReplyTo(message: { id: string; kind: string; login?: string; pending?: unknown }): boolean {
  if (!message.login || message.pending) return false;
  if (message.kind !== "chat" && message.kind !== "action") return false;
  return replyParentMsgId(message.id) !== null;
}
