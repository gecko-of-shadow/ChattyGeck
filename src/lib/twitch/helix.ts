import { config } from "@/lib/config";
import type { Session } from "./auth";

export interface BadgeImage {
  title: string;
  url1x: string;
  url2x?: string;
  url4x?: string;
}

/** `setId/version` -> image */
export type BadgeMap = Map<string, BadgeImage>;

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string;
}

export class HelixUnauthorizedError extends Error {}

async function helix<T>(session: Session, path: string): Promise<T> {
  const res = await fetch(`${config.helixBase}${path}`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": session.clientId,
    },
  });
  if (res.status === 401) throw new HelixUnauthorizedError("Twitch rejected the login token");
  if (!res.ok) throw new Error(`Twitch API error ${res.status}`);
  return (await res.json()) as T;
}

interface HelixBadgeSet {
  set_id: string;
  versions: { id: string; title: string; image_url_1x: string; image_url_2x: string; image_url_4x: string }[];
}

function toBadgeMap(sets: HelixBadgeSet[]): BadgeMap {
  const map: BadgeMap = new Map();
  for (const set of sets) {
    for (const version of set.versions) {
      map.set(`${set.set_id}/${version.id}`, {
        title: version.title,
        url1x: version.image_url_1x,
        url2x: version.image_url_2x,
        url4x: version.image_url_4x,
      });
    }
  }
  return map;
}

export async function fetchGlobalBadges(session: Session): Promise<BadgeMap> {
  const body = await helix<{ data: HelixBadgeSet[] }>(session, "/chat/badges/global");
  return toBadgeMap(body.data);
}

export async function fetchChannelBadges(session: Session, roomId: string): Promise<BadgeMap> {
  const body = await helix<{ data: HelixBadgeSet[] }>(session, `/chat/badges?broadcaster_id=${roomId}`);
  return toBadgeMap(body.data);
}

export async function fetchUsers(session: Session, logins: string[]): Promise<TwitchUser[]> {
  const users: TwitchUser[] = [];
  for (let i = 0; i < logins.length; i += 100) {
    const query = logins
      .slice(i, i + 100)
      .map((login) => `login=${encodeURIComponent(login)}`)
      .join("&");
    const body = await helix<{
      data: { id: string; login: string; display_name: string; profile_image_url: string }[];
    }>(session, `/users?${query}`);
    users.push(
      ...body.data.map((u) => ({
        id: u.id,
        login: u.login,
        displayName: u.display_name,
        avatarUrl: u.profile_image_url,
      })),
    );
  }
  return users;
}

/**
 * Badges that work without logging in (Helix needs a token). These are Twitch's public
 * badge images for the global roles people care about in chat.
 */
const PUBLIC_BADGES: Record<string, { uuid: string; title: string }> = {
  broadcaster: { uuid: "5527c58c-fb7d-422d-b71b-f309dcb85cc1", title: "Broadcaster" },
  moderator: { uuid: "3267646d-33f0-4b17-b3df-f923a41db1d0", title: "Moderator" },
  vip: { uuid: "b817aba4-fad8-49e2-b88a-7cc744dfa6ec", title: "VIP" },
  partner: { uuid: "d12a2e27-16f6-41d0-ab77-b780518f00a3", title: "Verified" },
  staff: { uuid: "d97c37bd-a6f5-4c38-8f57-4e4bef88af34", title: "Staff" },
  turbo: { uuid: "bd444ec6-8f34-4bf9-91f4-af1e3428d80f", title: "Turbo" },
  premium: { uuid: "bbbe0db0-a598-423e-86d0-f9fb98ca1933", title: "Prime Gaming" },
  subscriber: { uuid: "5d9f2208-5dd8-11e7-8513-2ff4adfae661", title: "Subscriber" },
  founder: { uuid: "511b78a9-ab37-472f-9569-457753bbe7d3", title: "Founder" },
};

export function publicBadge(setId: string): BadgeImage | undefined {
  const badge = PUBLIC_BADGES[setId];
  if (!badge) return undefined;
  const base = `https://static-cdn.jtvnw.net/badges/v1/${badge.uuid}`;
  return { title: badge.title, url1x: `${base}/1`, url2x: `${base}/2`, url4x: `${base}/3` };
}
