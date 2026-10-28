#!/usr/bin/env python3
"""Fail when a diff or its changed files contain personal strings or obvious secrets.

PRIVACY_PATTERNS (environment variable, newline-separated, case-insensitive
regular expressions) comes from a GitHub Actions secret. This process never
prints those patterns or the text that matched. A hit is reported as a file
path and a line number only.

An empty or missing PRIVACY_PATTERNS skips the personal-string check with a
warning. Obvious secrets are always checked.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

# Generic credential shapes. Safe to keep in the repository: they are not
# anyone's name, email, or username.
SECRET_SOURCES = (
    r"-----BEGIN (?:OPENSSH |RSA |EC |DSA |PGP )?PRIVATE KEY-----",
    r"(?:^|[^A-Za-z0-9])ghp_[A-Za-z0-9]{20,}",
    r"(?:^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}",
    r"(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]{20,}",
    r"(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}",
)

MESSAGES = {
    "personal": "Forbidden personal string",
    "secret": "Possible committed secret",
}

ZERO_SHA = "0" * 40


def warn(message: str) -> None:
    print(f"::warning::{message}")


def workflow_error(path: str, line_no: int, message: str) -> None:
    safe_path = path.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error file={safe_path},line={line_no}::{message}")


def annotate(path: str, line_no: int, kind: str) -> None:
    workflow_error(path, line_no, MESSAGES[kind])


def git_out(args: list[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", "-c", "core.quotepath=false", *args],
        capture_output=True,
        check=False,
    )


def git_text(args: list[str]) -> str:
    result = git_out(args)
    if result.returncode != 0:
        # Git's own errors are about refs, not file contents. Keep them short.
        sys.stderr.write(result.stderr.decode("utf-8", "replace")[:500])
        sys.stderr.write("\n")
        raise SystemExit(1)
    return result.stdout.decode("utf-8", "replace")


def commit_exists(sha: str) -> bool:
    if not sha or sha == ZERO_SHA or set(sha) == {"0"}:
        return False
    return git_out(["cat-file", "-e", f"{sha}^{{commit}}"]).returncode == 0


def load_personal() -> tuple[list[re.Pattern[str]] | None, bool]:
    """Return compiled patterns and whether the secret was missing or empty.

    None for the pattern list means a line was not a valid regular expression.
    The pattern text is never included in the message.
    """
    raw = os.environ.get("PRIVACY_PATTERNS", "")
    patterns: list[re.Pattern[str]] = []
    saw_pattern = False
    for index, line in enumerate(raw.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        saw_pattern = True
        try:
            patterns.append(re.compile(line, re.IGNORECASE))
        except re.error:
            print(f"::error::PRIVACY_PATTERNS entry {index} is not a valid regular expression")
            return None, False
    return patterns, not saw_pattern


def compile_secrets() -> list[re.Pattern[str]]:
    return [re.compile(source) for source in SECRET_SOURCES]


def kinds_in(line: str, personal: list[re.Pattern[str]], secrets: list[re.Pattern[str]]) -> list[str]:
    found: list[str] = []
    for pattern in personal:
        if pattern.search(line):
            found.append("personal")
            break
    for pattern in secrets:
        if pattern.search(line):
            found.append("secret")
            break
    return found


def unquote_path(raw: str) -> str | None:
    path = raw.strip()
    if path == "/dev/null":
        return None
    if path.startswith(("a/", "b/")):
        path = path[2:]
    if len(path) >= 2 and path[0] == '"' and path[-1] == '"':
        try:
            path = path[1:-1].encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8")
        except UnicodeError:
            print("::error::A changed path could not be read")
            raise SystemExit(1) from None
    path = path.replace("\\", "/")
    norm = os.path.normpath(path)
    if os.path.isabs(norm) or norm == ".." or norm.startswith(f"..{os.sep}"):
        print("::error::A changed path could not be read")
        raise SystemExit(1)
    return norm


def record(
    path: str | None,
    line_no: int,
    text: str,
    personal: list[re.Pattern[str]],
    secrets: list[re.Pattern[str]],
    seen: set[tuple[str, str, int]],
) -> int:
    if path is None or line_no < 1:
        return 0
    hits = 0
    for kind in kinds_in(text, personal, secrets):
        key = (kind, path, line_no)
        if key in seen:
            continue
        seen.add(key)
        annotate(path, line_no, kind)
        hits += 1
    return hits


def scan_diff(
    diff: str,
    personal: list[re.Pattern[str]],
    secrets: list[re.Pattern[str]],
    seen: set[tuple[str, str, int]],
) -> int:
    old_path: str | None = None
    new_path: str | None = None
    old_line = 0
    new_line = 0
    binary = False
    hits = 0
    for line in diff.splitlines():
        if line.startswith("diff --git "):
            old_path = None
            new_path = None
            binary = False
            continue
        if line.startswith("Binary files ") or line.startswith("GIT binary patch"):
            binary = True
            continue
        if binary:
            continue
        if line.startswith("--- "):
            old_path = unquote_path(line[4:])
            continue
        if line.startswith("+++ "):
            new_path = unquote_path(line[4:])
            continue
        if line.startswith("@@"):
            match = re.match(r"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
            if match:
                old_line = int(match.group(1))
                new_line = int(match.group(2))
            continue
        if line.startswith("\\"):
            continue
        if line.startswith("+"):
            hits += record(new_path, new_line, line[1:], personal, secrets, seen)
            new_line += 1
            continue
        if line.startswith("-"):
            hits += record(old_path, old_line, line[1:], personal, secrets, seen)
            old_line += 1
            continue
        if old_line:
            old_line += 1
        if new_line:
            new_line += 1
    return hits


def scan_file(
    path: str,
    personal: list[re.Pattern[str]],
    secrets: list[re.Pattern[str]],
    seen: set[tuple[str, str, int]],
) -> int:
    if not os.path.isfile(path):
        return 0
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError:
        workflow_error(path, 1, "Changed file could not be read")
        return 1
    if b"\0" in data:
        return 0
    text = data.decode("utf-8", "replace")
    hits = 0
    for line_no, line in enumerate(text.splitlines(), start=1):
        hits += record(path, line_no, line, personal, secrets, seen)
    return hits


def diff_args(base: str | None, head: str) -> tuple[list[str], list[str]]:
    if base:
        return (
            ["diff", "--no-color", "--unified=0", "--find-renames", base, head],
            ["diff", "--no-color", "--name-only", "--find-renames", "--diff-filter=ACDMRTUXB", base, head],
        )
    # No base (a new history). Scan the latest commit, including a root commit.
    parent = git_out(["rev-parse", "--verify", "--quiet", f"{head}^"])
    if parent.returncode == 0:
        parent_sha = parent.stdout.decode("utf-8", "replace").strip()
        return (
            ["diff", "--no-color", "--unified=0", "--find-renames", parent_sha, head],
            ["diff", "--no-color", "--name-only", "--find-renames", "--diff-filter=ACDMRTUXB", parent_sha, head],
        )
    return (
        ["show", "--format=", "--no-color", "--unified=0", "--find-renames", head],
        ["diff-tree", "--root", "--no-commit-id", "--name-only", "--find-renames", "-r", head],
    )


def resolve_base() -> str | None:
    event = os.environ.get("EVENT_NAME", "")
    base = os.environ.get("BASE_SHA", "").strip()
    if commit_exists(base):
        return base
    if event == "pull_request":
        print("::error::Could not resolve the pull request base commit")
        raise SystemExit(1)
    warn("Base commit unavailable; scanned the latest commit only")
    return None


def main() -> int:
    personal, secret_missing = load_personal()
    if personal is None:
        return 1
    if secret_missing:
        warn("PRIVACY_PATTERNS secret not set; personal-string check skipped")
        personal = []

    secrets = compile_secrets()
    head = os.environ.get("HEAD_SHA", "").strip() or "HEAD"
    if git_out(["rev-parse", "--verify", "--quiet", head]).returncode != 0:
        print("::error::Could not resolve the commit to scan")
        return 1

    base = resolve_base()
    diff_cmd, names_cmd = diff_args(base, head)
    seen: set[tuple[str, str, int]] = set()
    hits = scan_diff(git_text(diff_cmd), personal, secrets, seen)
    for raw_path in git_text(names_cmd).splitlines():
        path = unquote_path(raw_path)
        if path:
            hits += scan_file(path, personal, secrets, seen)
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
