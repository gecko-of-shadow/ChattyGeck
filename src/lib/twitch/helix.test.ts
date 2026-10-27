import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./auth";
import { HelixUnauthorizedError, fetchFollowedChannels, fetchLiveStreams } from "./helix";

const session: Session = {
  clientId: "cid",
  login: "me",
  userId: "42",
  accessToken: "token",
  expiresAt: Date.now() + 3_600_000,
  scopes: ["chat:read", "chat:edit", "user:read:follows"],
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchFollowedChannels", () => {
  it("follows the page cursor and maps the fields", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const page = url.includes("after=") ? 2 : 1;
        return answer({
          data: [{ broadcaster_id: `${page}`, broadcaster_login: `chan${page}`, broadcaster_name: `Chan${page}`, followed_at: "2026-01-01T00:00:00Z" }],
          pagination: page === 1 ? { cursor: "next" } : {},
        });
      }),
    );
    const follows = await fetchFollowedChannels(session);
    expect(follows.map((f) => f.login)).toEqual(["chan1", "chan2"]);
    expect(follows[0]).toEqual({ id: "1", login: "chan1", displayName: "Chan1", followedAt: "2026-01-01T00:00:00Z" });
    expect(urls[0]).toContain("/channels/followed?user_id=42&first=100");
    expect(urls[1]).toContain("after=next");
  });

  it("throws the unauthorized error on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({ status: 401 }, 401)));
    await expect(fetchFollowedChannels(session)).rejects.toBeInstanceOf(HelixUnauthorizedError);
  });
});

describe("fetchLiveStreams", () => {
  it("asks 100 logins per call and keeps only live ones", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return answer({
          data: url.includes("user_login=c0&")
            ? [
                { user_login: "C0", viewer_count: 12, type: "live" },
                { user_login: "c1", viewer_count: 3, type: "" },
              ]
            : [],
        });
      }),
    );
    const logins = Array.from({ length: 150 }, (_, i) => `c${i}`);
    expect(await fetchLiveStreams(session, logins)).toEqual({ c0: 12 });
    expect(urls).toHaveLength(2);
    expect(urls[0].match(/user_login=/g)).toHaveLength(100);
    expect(urls[1].match(/user_login=/g)).toHaveLength(50);
  });
});
