export interface IrcMessage {
  raw: string;
  tags: Record<string, string>;
  prefix: string | null;
  /** Nick part of the prefix (`nick!user@host`), or the server name for server messages. */
  nick: string | null;
  command: string;
  params: string[];
}

const TAG_ESCAPES: Record<string, string> = {
  ":": ";",
  s: " ",
  "\\": "\\",
  r: "\r",
  n: "\n",
};

export function unescapeTagValue(value: string): string {
  if (!value.includes("\\")) return value;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) break;
    out += TAG_ESCAPES[next] ?? next;
    i++;
  }
  return out;
}

function skipSpaces(line: string, pos: number): number {
  while (line[pos] === " ") pos++;
  return pos;
}

/** Parses one IRCv3 line (with Twitch tags). Returns null for blank or malformed lines. */
export function parseIrcLine(line: string): IrcMessage | null {
  if (!line) return null;
  let pos = 0;
  const tags: Record<string, string> = {};

  if (line[0] === "@") {
    const end = line.indexOf(" ");
    if (end === -1) return null;
    for (const part of line.slice(1, end).split(";")) {
      if (!part) continue;
      const eq = part.indexOf("=");
      if (eq === -1) tags[part] = "";
      else tags[part.slice(0, eq)] = unescapeTagValue(part.slice(eq + 1));
    }
    pos = skipSpaces(line, end + 1);
  }

  let prefix: string | null = null;
  if (line[pos] === ":") {
    const end = line.indexOf(" ", pos);
    if (end === -1) return null;
    prefix = line.slice(pos + 1, end);
    pos = skipSpaces(line, end + 1);
  }

  const commandEnd = line.indexOf(" ", pos);
  const command = (commandEnd === -1 ? line.slice(pos) : line.slice(pos, commandEnd)).toUpperCase();
  if (!command) return null;
  pos = commandEnd === -1 ? line.length : commandEnd + 1;

  const params: string[] = [];
  while (pos < line.length) {
    pos = skipSpaces(line, pos);
    if (pos >= line.length) break;
    if (line[pos] === ":") {
      params.push(line.slice(pos + 1));
      break;
    }
    const next = line.indexOf(" ", pos);
    if (next === -1) {
      params.push(line.slice(pos));
      break;
    }
    params.push(line.slice(pos, next));
    pos = next + 1;
  }

  const nick = prefix ? prefix.split("!")[0] : null;
  return { raw: line, tags, prefix, nick, command, params };
}

/** `#xqc` -> `xqc` */
export function channelFromParam(param: string | undefined): string {
  if (!param) return "";
  return (param.startsWith("#") ? param.slice(1) : param).toLowerCase();
}
