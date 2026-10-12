import { isTauri } from "./platform";

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
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("apply_update", { downloadUrl });
}
