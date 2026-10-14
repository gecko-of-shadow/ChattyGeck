import { describe, expect, it } from "vitest";
import { canReplyTo, replyParentMsgId, replySnippet } from "./reply";

const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("replyParentMsgId", () => {
  it("keeps a Twitch message id", () => {
    expect(replyParentMsgId(UUID)).toBe(UUID);
    expect(replyParentMsgId(UUID.toUpperCase())).toBe(UUID.toUpperCase());
  });

  it("rejects local rows and anything that could break an IRC tag", () => {
    expect(replyParentMsgId("send-abc-defghij")).toBeNull();
    expect(replyParentMsgId("msg-abc-defghij")).toBeNull();
    expect(replyParentMsgId("event-abc-defghi")).toBeNull();
    expect(replyParentMsgId("sys-abc-defghijk")).toBeNull();
    expect(replyParentMsgId("hist-boundary:geckotown")).toBeNull();
    expect(replyParentMsgId("bad id here")).toBeNull();
    expect(replyParentMsgId("has;semi")).toBeNull();
    expect(replyParentMsgId("line\nbreak")).toBeNull();
    expect(replyParentMsgId("short")).toBeNull();
    expect(replyParentMsgId(`${"a".repeat(81)}`)).toBeNull();
  });
});

describe("replySnippet", () => {
  it("flattens whitespace and shortens a long parent", () => {
    expect(replySnippet("  geckos\nrule  ")).toBe("geckos rule");
    expect(replySnippet("a".repeat(90)).endsWith("…")).toBe(true);
    expect(replySnippet("a".repeat(90)).length).toBe(80);
  });
});

describe("canReplyTo", () => {
  it("allows a real chat line and skips pending, local, and system rows", () => {
    expect(canReplyTo({ id: UUID, kind: "chat", login: "ada" })).toBe(true);
    expect(canReplyTo({ id: UUID, kind: "action", login: "ada" })).toBe(true);
    expect(canReplyTo({ id: UUID, kind: "chat", login: "ada", pending: "sending" })).toBe(false);
    expect(canReplyTo({ id: "send-abc-defghij", kind: "chat", login: "ada" })).toBe(false);
    expect(canReplyTo({ id: UUID, kind: "event", login: "ada" })).toBe(false);
    expect(canReplyTo({ id: UUID, kind: "chat" })).toBe(false);
  });
});
