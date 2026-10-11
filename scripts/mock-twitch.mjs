// Offline stand-in for Twitch so login + sending can be tested without a real account.
//
//   npm run mock:twitch            (IRC on ws://127.0.0.1:17422, HTTP on http://127.0.0.1:17423)
//   npm run dev:mock               (ChatDeck UI pointed at the mock)
//
// Device login auto-approves after two polls. The IRC side behaves like Twitch where it
// matters to ChatDeck: one command per frame, no echo to the sending connection, USERSTATE
// after a send, NOTICE on failures, RECONNECT/drops on demand.
import http from "node:http";
import { WebSocketServer } from "ws";

const IRC_PORT = Number(process.env.MOCK_IRC_PORT ?? 17422);
const HTTP_PORT = Number(process.env.MOCK_HTTP_PORT ?? 17423);
const USER = { login: "geckotester", id: "424242", displayName: "GeckoTester" };
const CLIENT_ID = "mock-client-id";
const SCOPES = ["chat:read", "chat:edit"];

const tokens = new Map(); // access token -> expiry
const refreshTokens = new Set();
let tokenCounter = 0;
let pollsBeforeApproval = 2;

function issueTokens() {
  tokenCounter++;
  const access = `mock-access-${tokenCounter}`;
  const refresh = `mock-refresh-${tokenCounter}`;
  tokens.set(access, Date.now() + 4 * 3600_000);
  refreshTokens.add(refresh);
  return { access_token: access, refresh_token: refresh, expires_in: 14400, scope: SCOPES, token_type: "bearer" };
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(new URLSearchParams(data)));
  });
}

const avatar = (login) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#1f3a22"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#8fe05a" font-family="sans-serif">${login[0].toUpperCase()}</text></svg>`,
  )}`;

const roomId = (channel) => String(100000 + ([...channel].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % 900000));

// ------------------------------------------------------------------ HTTP: id.twitch.tv + Helix

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Authorization, Client-Id, Content-Type",
      "access-control-allow-methods": "GET, POST",
    });
    return res.end();
  }

  const bearer = (req.headers.authorization ?? "").replace(/^(OAuth|Bearer)\s+/i, "");
  const tokenValid = tokens.has(bearer) && tokens.get(bearer) > Date.now();

  switch (`${req.method} ${url.pathname}`) {
    case "POST /oauth2/device": {
      const body = await readBody(req);
      if (body.get("client_id") !== CLIENT_ID) return json(res, 400, { status: 400, message: "invalid client" });
      pollsBeforeApproval = 2;
      return json(res, 200, {
        device_code: "mock-device-code",
        user_code: "GECKO123",
        verification_uri: `http://127.0.0.1:${HTTP_PORT}/activate?device-code=GECKO123`,
        expires_in: 1800,
        interval: 1,
      });
    }
    case "POST /oauth2/token": {
      const body = await readBody(req);
      if (body.get("grant_type") === "refresh_token") {
        const refresh = body.get("refresh_token");
        if (!refreshTokens.delete(refresh)) return json(res, 400, { status: 400, message: "Invalid refresh token" });
        return json(res, 200, issueTokens());
      }
      if (pollsBeforeApproval-- > 0) return json(res, 400, { status: 400, message: "authorization_pending" });
      return json(res, 200, issueTokens());
    }
    case "GET /oauth2/validate":
      if (!tokenValid) return json(res, 401, { status: 401, message: "invalid access token" });
      return json(res, 200, {
        client_id: CLIENT_ID,
        login: USER.login,
        user_id: USER.id,
        scopes: SCOPES,
        expires_in: Math.round((tokens.get(bearer) - Date.now()) / 1000),
      });
    case "POST /oauth2/revoke": {
      const body = await readBody(req);
      tokens.delete(body.get("token"));
      return json(res, 200, {});
    }
    case "GET /activate":
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<h1>Mock Twitch</h1><p>ChatDeck's login will be approved automatically.</p>");
    case "GET /helix/users": {
      if (!tokenValid) return json(res, 401, { status: 401 });
      const logins = url.searchParams.getAll("login").filter((l) => !l.startsWith("nosuch"));
      return json(res, 200, {
        data: logins.map((login) => ({
          id: login === USER.login ? USER.id : roomId(login),
          login,
          display_name: login[0].toUpperCase() + login.slice(1),
          profile_image_url: avatar(login),
        })),
      });
    }
    case "GET /helix/chat/badges/global":
    case "GET /helix/chat/badges": {
      if (!tokenValid) return json(res, 401, { status: 401 });
      const badge = (set, uuid, title) => ({
        set_id: set,
        versions: [
          {
            id: "1",
            title,
            image_url_1x: `https://static-cdn.jtvnw.net/badges/v1/${uuid}/1`,
            image_url_2x: `https://static-cdn.jtvnw.net/badges/v1/${uuid}/2`,
            image_url_4x: `https://static-cdn.jtvnw.net/badges/v1/${uuid}/3`,
          },
        ],
      });
      return json(res, 200, {
        data: url.pathname.endsWith("global")
          ? [badge("moderator", "3267646d-33f0-4b17-b3df-f923a41db1d0", "Moderator"), badge("vip", "b817aba4-fad8-49e2-b88a-7cc744dfa6ec", "VIP")]
          : [],
      });
    }
    // Test controls
    case "POST /__drop":
      for (const client of clients) client.socket.terminate();
      return json(res, 200, { dropped: clients.size });
    case "POST /__reconnect":
      for (const client of clients) client.send(":tmi.twitch.tv RECONNECT");
      return json(res, 200, { ok: true });
    case "POST /__expire":
      tokens.clear();
      return json(res, 200, { ok: true });
    case "POST /__burst": {
      const channel = url.searchParams.get("channel") ?? "";
      const count = Number(url.searchParams.get("n") ?? 50);
      for (const client of clients) {
        if (!client.channels.has(channel)) continue;
        for (let i = 0; i < count; i++) {
          client.send(privmsgLine(channel, chatters[i % chatters.length], `${lines[i % lines.length]} (#${i + 1})`));
        }
      }
      return json(res, 200, { ok: true });
    }
    default:
      return json(res, 404, { status: 404, message: "not found" });
  }
});

// ------------------------------------------------------------------ IRC over WebSocket

const clients = new Set();
let msgCounter = 0;

function tagString(tags) {
  return Object.entries(tags)
    .map(([k, v]) => `${k}=${String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\:").replace(/ /g, "\\s")}`)
    .join(";");
}

function kappaTag(text) {
  const chars = [...text];
  const ranges = [];
  const words = text.split(" ");
  let index = 0;
  for (const word of words) {
    if (word === "Kappa") ranges.push(`${index}-${index + 4}`);
    index += [...word].length + 1;
  }
  return ranges.length && chars.length ? `25:${ranges.join(",")}` : "";
}

function privmsgLine(channel, user, text, extra = {}) {
  const tags = {
    "badge-info": "",
    badges: user.badges ?? "",
    color: user.color ?? "",
    "display-name": user.displayName,
    emotes: kappaTag(text),
    id: `mock-${++msgCounter}`,
    "room-id": roomId(channel),
    "tmi-sent-ts": Date.now(),
    "user-id": user.id,
    ...extra,
  };
  return `@${tagString(tags)} :${user.login}!${user.login}@${user.login}.tmi.twitch.tv PRIVMSG #${channel} :${text}`;
}

const wss = new WebSocketServer({ port: IRC_PORT });
wss.on("connection", (socket) => {
  const client = {
    socket,
    nick: null,
    pass: null,
    authed: false,
    channels: new Set(),
    send: (line) => socket.readyState === 1 && socket.send(`${line}\r\n`),
  };
  clients.add(client);
  socket.on("close", () => clients.delete(client));

  socket.on("message", (data) => {
    // Like Twitch: only the first line of a frame counts.
    const line = String(data).split("\r\n")[0];
    const [command, ...rest] = line.split(" ");
    switch (command.toUpperCase()) {
      case "CAP":
        return client.send(":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands");
      case "PASS":
        client.pass = rest.join(" ");
        return;
      case "NICK": {
        client.nick = rest[0].toLowerCase();
        if (!client.nick.startsWith("justinfan")) {
          const token = (client.pass ?? "").replace(/^oauth:/, "");
          if (!tokens.has(token) || client.nick !== USER.login) {
            client.send(":tmi.twitch.tv NOTICE * :Login authentication failed");
            return socket.close();
          }
          client.authed = true;
        }
        for (const [code, text] of [
          ["001", "Welcome, GLHF!"],
          ["002", "Your host is tmi.twitch.tv"],
          ["376", ">"],
        ]) {
          client.send(`:tmi.twitch.tv ${code} ${client.nick} :${text}`);
        }
        return;
      }
      case "PING":
        return client.send(`:tmi.twitch.tv PONG tmi.twitch.tv :${rest.join(" ").replace(/^:/, "")}`);
      case "JOIN": {
        const channel = rest[0].replace(/^#/, "").toLowerCase();
        if (channel.startsWith("nosuch")) return;
        client.channels.add(channel);
        client.send(`:${client.nick}!${client.nick}@${client.nick}.tmi.twitch.tv JOIN #${channel}`);
        client.send(`@emote-only=0;followers-only=-1;r9k=0;room-id=${roomId(channel)};slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #${channel}`);
        if (client.authed) {
          client.send(`@badge-info=;badges=moderator/1;color=#8FE05A;display-name=${USER.displayName};emote-sets=0;mod=1 :tmi.twitch.tv USERSTATE #${channel}`);
        }
        setTimeout(() => client.send(privmsgLine(channel, chatters[1], `welcome to #${channel}, grab a warm rock`)), 300);
        return;
      }
      case "PART":
        client.channels.delete(rest[0].replace(/^#/, "").toLowerCase());
        return;
      case "PRIVMSG": {
        if (!client.authed) return;
        const channel = rest[0].replace(/^#/, "").toLowerCase();
        const text = line.slice(line.indexOf(" :") + 2);
        if (text.includes("fail-me")) {
          return client.send(`@msg-id=msg_ratelimit :tmi.twitch.tv NOTICE #${channel} :Your message was not sent because you are sending messages too quickly.`);
        }
        client.send(`@badge-info=;badges=moderator/1;color=#8FE05A;display-name=${USER.displayName};mod=1 :tmi.twitch.tv USERSTATE #${channel}`);
        const out = privmsgLine(channel, { ...USER, color: "#8FE05A", badges: "moderator/1" }, text);
        for (const other of clients) if (other !== client && other.channels.has(channel)) other.send(out);
        return;
      }
    }
  });
});

// ------------------------------------------------------------------ ambient chatter

const chatters = [
  { login: "leopard_lou", id: "11", displayName: "Leopard_Lou", color: "#F4C542", badges: "subscriber/0" },
  { login: "tokaytom", id: "12", displayName: "TokayTom", color: "#7CB8FF", badges: "vip/1" },
  { login: "crestedcarl", id: "13", displayName: "CrestedCarl", color: "", badges: "" },
];
const lines = [
  "anyone else sticking around for the next round? Kappa",
  "this chat moves faster than a gecko on glass",
  "@geckotester you seeing this?",
  "catJAM catJAM",
  "LUL that was close",
  "gg",
];
setInterval(() => {
  for (const client of clients) {
    for (const channel of client.channels) {
      if (Math.random() < 0.55) continue;
      const user = chatters[Math.floor(Math.random() * chatters.length)];
      client.send(privmsgLine(channel, user, lines[Math.floor(Math.random() * lines.length)], { "first-msg": Math.random() < 0.05 ? "1" : "0" }));
    }
  }
}, 1500);

httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(`Mock Twitch ready: IRC ws://127.0.0.1:${IRC_PORT}  HTTP http://127.0.0.1:${HTTP_PORT}  client id ${CLIENT_ID}`);
});
