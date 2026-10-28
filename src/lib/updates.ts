import { toast } from "sonner";
import { isTauri, openExternal } from "./platform";

export const RELEASES_URL = "https://github.com/gecko-of-shadow/ZooChattr/releases";
/** Shown instead of a GitHub result while ZOOCHATTR_VERIFY=1. */
export const VERIFY_UPDATES_OFF = "Update checks are off in verify mode. GitHub was not contacted.";

let verifyMode = import.meta.env.VITE_ZOOCHATTR_VERIFY === "1";

export function inVerifyMode(): boolean {
  return verifyMode;
}

/** The desktop shell sets this from app_info.verify before the first update check. */
export function setVerifyMode(on: boolean): void {
  verifyMode = on;
}

/** Verify mode must not call api.github.com. A normal launch (flag off) still does. */
export function shouldContactGitHub(verify: boolean): boolean {
  return !verify;
}
/** Same text as SAFETY_CHECK_FAILED in src-tauri/src/update.rs. */
export const SAFETY_CHECK_FAILED = "This update didn't pass its safety check. Nothing was changed.";

/**
 * Same rule as trusted_release_zip in src-tauri/src/update.rs (Rust checks again before installing): only a
 * ZooChattr-portable zip in this repo's GitHub releases.
 */
export function isTrustedReleaseUrl(url: string): boolean {
  const match = /^https:\/\/github\.com\/gecko-of-shadow\/ZooChattr\/releases\/download\/([A-Za-z0-9._+-]+)\/(ZooChattr-portable-[A-Za-z0-9._+-]+\.zip)$/.exec(url);
  if (!match) return false;
  const [, tag, name] = match;
  return tag !== "." && tag !== ".." && name !== "ZooChattr-portable-.zip";
}

/** Rust sends errors as plain strings; show the real reason either way. */
export function updateErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Couldn't install the update.";
}

export interface UpdateInfo {
  /** Latest release tag, e.g. "v0.4.0". */
  tag: string;
  version: string;
  /** Direct zip download URL for the portable build. */
  downloadUrl: string;
  notes: string;
  publishedAt: string;
}

function parseVersion(tag: string): number[] {
  return tag
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
}

/** True when `latest` is a higher semver than `current` (tags may start with v). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

/**
 * Asks GitHub for the latest ZooChattr release. In the desktop app this goes through Rust
 * (no CORS). In the browser mock it hits the public API directly.
 */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  if (!shouldContactGitHub(inVerifyMode())) return null;
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<UpdateInfo | null>("check_for_update");
  }
  const response = await fetch("https://api.github.com/repos/gecko-of-shadow/ZooChattr/releases/latest", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ZooChattr" },
  });
  if (!response.ok) throw new Error(`GitHub said ${response.status}`);
  const body = (await response.json()) as {
    tag_name?: string;
    body?: string;
    published_at?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const tag = body.tag_name ?? "";
  const asset = (body.assets ?? []).find((a) => /ZooChattr-portable-.*\.zip$/i.test(a.name ?? ""));
  if (!tag || !asset?.browser_download_url) return null;
  return {
    tag,
    version: tag.replace(/^v/i, ""),
    downloadUrl: asset.browser_download_url,
    notes: (body.body ?? "").trim(),
    publishedAt: body.published_at ?? "",
  };
}

/** Downloads the portable zip and swaps in the new exe, keeping ZooChattr-data. Restarts the app. */
export async function applyUpdate(downloadUrl: string): Promise<void> {
  if (!isTauri) throw new Error("Updates only install from the desktop app.");
  if (!isTrustedReleaseUrl(downloadUrl)) throw new Error(SAFETY_CHECK_FAILED);
  const { chat } = await import("@/lib/chat/controller");
  await chat.flushSavedHistory();
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("apply_update", { downloadUrl });
}

/** Install from a toast or event: on failure, say why and offer the Releases page for a manual download. */
export function installUpdate(downloadUrl: string): void {
  void applyUpdate(downloadUrl).catch((err) => {
    toast.error("Couldn't install the update", {
      description: updateErrorText(err),
      duration: 20_000,
      action: { label: "Releases", onClick: () => void openExternal(RELEASES_URL) },
    });
  });
}
