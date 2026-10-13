import { describe, expect, it } from "vitest";
import { allowedExternalUrl } from "./platform";

describe("allowedExternalUrl", () => {
  it("allows http and https links", () => {
    expect(allowedExternalUrl("https://www.twitch.tv/geckotown")).toBe("https://www.twitch.tv/geckotown");
    expect(allowedExternalUrl("http://127.0.0.1:17423/activate")).toBe("http://127.0.0.1:17423/activate");
  });

  it("rejects other protocols and junk", () => {
    expect(allowedExternalUrl("javascript:alert(1)")).toBeNull();
    expect(allowedExternalUrl("file:///etc/passwd")).toBeNull();
    expect(allowedExternalUrl("not a url")).toBeNull();
  });
});
