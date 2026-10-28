import { describe, expect, it } from "vitest";
// The harness is plain JavaScript. This import is the cleanup guard itself.
// @ts-expect-error no declaration file for the verification script
import { isInsideRoot } from "../../.claude/skills/verify-zoochattr/scripts/verify.mjs";

/** Enough of Node's path.resolve for absolute paths used in these cases. */
function resolvePosix(value: string): string {
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function resolveWin32(value: string): string {
  const normalized = value.replaceAll("/", "\\");
  const drive = normalized.slice(0, 2);
  const rest = normalized.slice(2);
  const parts: string[] = [];
  for (const part of rest.split("\\")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${drive}\\${parts.join("\\")}`;
}

describe("verify cleanup path guard", () => {
  const posix = { resolve: resolvePosix, sep: "/" };
  const root = "/tmp/zoochattr-verify";

  it("allows a run directory under the verify temp root", () => {
    expect(isInsideRoot("/tmp/zoochattr-verify/20261028-run/data", root, posix)).toBe(true);
  });

  it("refuses the root itself, a sibling prefix, and other folders", () => {
    expect(isInsideRoot(root, root, posix)).toBe(false);
    expect(isInsideRoot("/tmp/zoochattr-verify-evil", root, posix)).toBe(false);
    expect(isInsideRoot("/tmp", root, posix)).toBe(false);
    expect(isInsideRoot("", root, posix)).toBe(false);
  });

  it("uses the same rule for a Windows temp path", () => {
    const win = { resolve: resolveWin32, sep: "\\" };
    const winRoot = "C:\\Users\\tester\\AppData\\Local\\Temp\\zoochattr-verify";
    expect(isInsideRoot(`${winRoot}\\run-1`, winRoot, win)).toBe(true);
    expect(isInsideRoot("C:\\Users\\tester\\AppData\\Local\\Temp\\zoochattr-verify-not", winRoot, win)).toBe(false);
    expect(isInsideRoot("C:\\Users\\tester\\Projects\\ZooChattr", winRoot, win)).toBe(false);
    expect(isInsideRoot(`${winRoot}\\..\\secrets`, winRoot, win)).toBe(false);
  });
});
