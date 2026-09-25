#!/usr/bin/env python3
"""Refresh and acknowledge the live Engineering Relay V3.1 basis for this repo.

State is kept under .git/relay-v31-live so the handshake never dirties the
working tree. A changed Common/main SHA returns exit 2 until the agent has read
the emitted live SKILL/two-pass paths and explicitly acknowledges that SHA.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

COMMON_URL = "https://github.com/reallaksh19/Common.git"


def run(*args: str, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        list(args),
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"command failed: {' '.join(args)}")
    return result


def repo_root() -> Path:
    result = run("git", "rev-parse", "--show-toplevel")
    return Path(result.stdout.strip()).resolve()


def git_dir(root: Path) -> Path:
    result = run("git", "-C", str(root), "rev-parse", "--git-dir")
    value = Path(result.stdout.strip())
    return value.resolve() if value.is_absolute() else (root / value).resolve()


def state_paths(root: Path) -> tuple[Path, Path, Path]:
    base = git_dir(root) / "relay-v31-live"
    return base, base / "current.json", base / "acknowledged.json"


def refresh_common(root: Path) -> dict:
    base, current_path, ack_path = state_paths(root)
    common = base / "common"
    base.mkdir(parents=True, exist_ok=True)

    if not (common / ".git").exists():
        if common.exists():
            raise RuntimeError(f"live Common cache exists but is not a git checkout: {common}")
        run("git", "clone", "--quiet", "--depth", "1", "--branch", "main", COMMON_URL, str(common))
    else:
        run("git", "-C", str(common), "fetch", "--quiet", "--depth", "1", "origin", "main")
        run("git", "-C", str(common), "checkout", "--quiet", "--detach", "FETCH_HEAD")
        run("git", "-C", str(common), "reset", "--quiet", "--hard", "FETCH_HEAD")

    resolver = common / "skills/engineering-pr-delivery-v3.1/scripts/live_protocol_basis.py"
    if not resolver.exists():
        raise RuntimeError("live Common/main does not provide the V3.1 live protocol basis resolver")
    result = run(sys.executable, str(resolver), "--json", cwd=common)
    basis = json.loads(result.stdout)

    current_path.write_text(json.dumps(basis, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    acknowledged = None
    if ack_path.exists():
        try:
            acknowledged = json.loads(ack_path.read_text(encoding="utf-8"))
        except Exception:
            acknowledged = None

    basis["cache_path"] = str(common)
    basis["skill_path"] = str(common / "skills/engineering-pr-delivery-v3.1/SKILL.md")
    basis["two_pass_schema_path"] = str(common / "skills/two-pass-prompt-generator/schema.md")
    basis["acknowledged_sha"] = (acknowledged or {}).get("common_sha")
    basis["refresh_required"] = basis["acknowledged_sha"] != basis["common_sha"]
    return basis


def acknowledge(root: Path, sha: str) -> dict:
    base, current_path, ack_path = state_paths(root)
    if not current_path.exists():
        raise RuntimeError("no live basis has been refreshed; run refresh first")
    basis = json.loads(current_path.read_text(encoding="utf-8"))
    if basis.get("common_sha") != sha:
        raise RuntimeError(
            f"cannot acknowledge {sha}; current refreshed Common/main is {basis.get('common_sha')}"
        )
    ack = {
        "protocol": basis.get("protocol"),
        "common_repository": basis.get("common_repository"),
        "common_sha": basis.get("common_sha"),
        "two_pass_revision": basis.get("two_pass_revision"),
    }
    base.mkdir(parents=True, exist_ok=True)
    ack_path.write_text(json.dumps(ack, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return ack


def main() -> None:
    parser = argparse.ArgumentParser(description="Live V3.1 agent protocol handshake.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("refresh")
    ack = sub.add_parser("acknowledge")
    ack.add_argument("--sha", required=True)
    sub.add_parser("status")
    args = parser.parse_args()

    root = repo_root()
    base, current_path, ack_path = state_paths(root)

    if args.command == "refresh":
        basis = refresh_common(root)
        print(json.dumps(basis, indent=2, sort_keys=True))
        if basis["refresh_required"]:
            print("\nREFRESH_REQUIRED", file=sys.stderr)
            print(f"Read: {basis['skill_path']}", file=sys.stderr)
            print(f"Read: {basis['two_pass_schema_path']}", file=sys.stderr)
            print(
                f"Then acknowledge: python scripts/relay-v31-live.py acknowledge --sha {basis['common_sha']}",
                file=sys.stderr,
            )
            raise SystemExit(2)
        print("\nLIVE_V31_ACKNOWLEDGED")
        return

    if args.command == "acknowledge":
        value = acknowledge(root, args.sha)
        print(json.dumps(value, indent=2, sort_keys=True))
        return

    current = json.loads(current_path.read_text(encoding="utf-8")) if current_path.exists() else None
    acknowledged = json.loads(ack_path.read_text(encoding="utf-8")) if ack_path.exists() else None
    print(json.dumps({"current": current, "acknowledged": acknowledged}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
