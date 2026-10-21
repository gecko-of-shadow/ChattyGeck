/** Stands in for the runtime's "cloudflare:workers" module under Node (see vitest.config.ts). */
export class DurableObject<Env = unknown> {
  constructor(
    protected readonly ctx: { storage: { getAlarm(): Promise<number | null>; setAlarm(time: number): Promise<void> } },
    protected readonly env: Env,
  ) {}
}
