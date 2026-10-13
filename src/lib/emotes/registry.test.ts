import { describe, expect, it } from "vitest";
import { EmoteRegistry } from "./registry";

describe("channelNeedsRetry", () => {
  it("is not a failed download when the channel has not been loaded yet", () => {
    expect(new EmoteRegistry().channelNeedsRetry("geckotown")).toBe(false);
  });
});
