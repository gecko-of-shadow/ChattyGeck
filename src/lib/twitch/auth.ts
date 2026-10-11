import { config } from "@/lib/config";

export interface Session {
  clientId: string;
  login: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  /** Unix ms. */
  expiresAt: number;
  scopes: string[];
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalMs: number;
}

export type PollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "success"; session: Session };

export class AuthError extends Error {}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[];
}

interface ValidateResponse {
  client_id: string;
  login: string;
  user_id: string;
  scopes: string[] | null;
  expires_in: number;
}

function form(data: Record<string, string>): URLSearchParams {
  return new URLSearchParams(data);
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function startDeviceFlow(clientId: string): Promise<DeviceCode> {
  const res = await fetch(`${config.authBase}/oauth2/device`, {
    method: "POST",
    body: form({ client_id: clientId, scopes: config.scopes.join(" ") }),
  });
  if (!res.ok) {
    const message = await readError(res);
    if (/invalid client/i.test(message)) {
      throw new AuthError("Twitch doesn't recognise this Client ID. Double-check it in the Twitch Developer Console.");
    }
    throw new AuthError(`Twitch refused to start the login: ${message}`);
  }
  const body = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresAt: Date.now() + body.expires_in * 1000,
    intervalMs: Math.max(body.interval ?? 5, 1) * 1000,
  };
}

export async function validateToken(accessToken: string): Promise<ValidateResponse | null> {
  const res = await fetch(`${config.authBase}/oauth2/validate`, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Token check failed: ${await readError(res)}`);
  return (await res.json()) as ValidateResponse;
}

async function sessionFromTokens(clientId: string, tokens: TokenResponse): Promise<Session> {
  const info = await validateToken(tokens.access_token);
  if (!info) throw new AuthError("Twitch issued a token that it then rejected. Try logging in again.");
  return {
    clientId,
    login: info.login,
    userId: info.user_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (info.expires_in || tokens.expires_in || 3600) * 1000,
    scopes: info.scopes ?? tokens.scope ?? [],
  };
}

export async function pollDeviceFlow(clientId: string, deviceCode: string): Promise<PollResult> {
  const res = await fetch(`${config.authBase}/oauth2/token`, {
    method: "POST",
    body: form({
      client_id: clientId,
      scopes: config.scopes.join(" "),
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (res.ok) {
    const session = await sessionFromTokens(clientId, (await res.json()) as TokenResponse);
    return { status: "success", session };
  }
  const message = (await readError(res)).toLowerCase();
  if (message.includes("pending")) return { status: "pending" };
  if (message.includes("slow_down") || message.includes("slow down")) return { status: "slow_down" };
  if (message.includes("denied") || message.includes("declined")) return { status: "denied" };
  if (message.includes("invalid device code") || message.includes("expired")) return { status: "expired" };
  throw new AuthError(`Twitch login failed: ${message}`);
}

/** Public clients refresh without a client secret. Returns null when Twitch refuses. */
export async function refreshSession(session: Session): Promise<Session | null> {
  if (!session.refreshToken) return null;
  const res = await fetch(`${config.authBase}/oauth2/token`, {
    method: "POST",
    body: form({
      client_id: session.clientId,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`Couldn't refresh login: ${await readError(res)}`);
  return sessionFromTokens(session.clientId, (await res.json()) as TokenResponse);
}

export async function revokeToken(clientId: string, accessToken: string): Promise<void> {
  await fetch(`${config.authBase}/oauth2/revoke`, {
    method: "POST",
    body: form({ client_id: clientId, token: accessToken }),
  }).catch(() => undefined);
}
