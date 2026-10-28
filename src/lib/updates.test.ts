import { describe, expect, it } from "vitest";
import { SAFETY_CHECK_FAILED, VERIFY_UPDATES_OFF, fetchLatestRelease, isNewerVersion, isTrustedReleaseUrl, setVerifyMode, shouldContactGitHub, updateErrorText } from "./updates";

describe("isTrustedReleaseUrl (same cases as update.rs)", () => {
  it("accepts only this repo's portable zip", () => {
    expect(isTrustedReleaseUrl("https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip")).toBe(true);
    for (const bad of [
      "http://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
      "https://github.com/someone-else/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
      "https://github.com.example.test/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
      "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip?x=1",
      "https://github.com/gecko-of-shadow/ZooChattr/releases/download/../ZooChattr-portable-0.6.0.zip",
      "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/sub/ZooChattr-portable-0.6.0.zip",
      "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-.zip",
      "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/Other-0.6.0.zip",
      "https://user@github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
      "",
    ]) {
      expect(isTrustedReleaseUrl(bad), bad).toBe(false);
    }
  });

  it("shows Rust's plain-string errors as they are", () => {
    expect(updateErrorText(SAFETY_CHECK_FAILED)).toBe(SAFETY_CHECK_FAILED);
    expect(updateErrorText(new Error("Couldn't reach GitHub"))).toBe("Couldn't reach GitHub");
    expect(updateErrorText(undefined)).toBe("Couldn't install the update.");
  });
});

describe("verify mode update guard", () => {
  it("does not contact GitHub when verify mode is on", async () => {
    setVerifyMode(true);
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    try {
      expect(shouldContactGitHub(true)).toBe(false);
      expect(shouldContactGitHub(false)).toBe(true);
      await expect(fetchLatestRelease()).resolves.toBeNull();
      expect(called).toBe(false);
      expect(VERIFY_UPDATES_OFF).toContain("GitHub was not contacted");
    } finally {
      globalThis.fetch = original;
      setVerifyMode(false);
    }
  });
});

describe("isNewerVersion", () => {
  it("treats a higher patch as newer", () => {
    expect(isNewerVersion("0.4.0", "0.3.3")).toBe(true);
    expect(isNewerVersion("v0.4.0", "0.3.3")).toBe(true);
  });

  it("is false when versions match", () => {
    expect(isNewerVersion("0.4.0", "0.4.0")).toBe(false);
    expect(isNewerVersion("v0.4.0", "0.4.0")).toBe(false);
  });

  it("is false when latest is older", () => {
    expect(isNewerVersion("0.3.0", "0.4.0")).toBe(false);
  });

  it("agrees with is_newer_version in update.rs on suffixed versions", () => {
    expect(isNewerVersion("0.6.0-beta.2", "0.6.0")).toBe(true);
  });
});
