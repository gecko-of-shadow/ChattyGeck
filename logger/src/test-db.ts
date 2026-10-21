import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Db, Statement } from "./store";

/** In-memory SQLite behind the same calls D1 offers (D1 is SQLite), with schema.sql applied. */
export function testDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const bound = (sql: string, values: unknown[]): Statement => {
    const statement = raw.prepare(sql);
    const args = values as never[];
    return {
      run: async () => statement.run(...args),
      all: async <T>() => ({ results: statement.all(...args) as T[] }),
      first: async <T>() => (statement.get(...args) as T | undefined) ?? null,
    };
  };
  return {
    raw,
    prepare: (sql) => ({ bind: (...values) => bound(sql, values) }),
    batch: async (statements) => {
      const out: unknown[] = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    },
  };
}
