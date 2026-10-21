-- One row per channel per minute; `lines` holds that minute's raw IRC lines, newline-separated.
CREATE TABLE IF NOT EXISTS chat_bucket(channel_id TEXT NOT NULL, minute INTEGER NOT NULL, lines TEXT NOT NULL, n INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(channel_id,minute)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS channel(channel_id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE) WITHOUT ROWID;
