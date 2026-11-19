#!/usr/bin/env python3
"""Verify public-safe F01–F08 source custody against the frozen supplied ZIP.

Run this only after generate.py. This script does not modify fixtures.
"""
from pathlib import Path
from hashlib import sha256
import json, sys

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    "F01-text-mixed-3p.pdf": "b07ffb38f3495c410b47779b2508732f3aa7092c29d73b843191753c3da9b1f5",
    "F02-rotated-2p.pdf": "e9a40be14d253dd6916ff0d6a8ecbf1ccb36c4ca51452b98cddf6e345b812ddd",
    "F03-scan-only.pdf": "658b6536b8edc10931744bd75707155a0e731666c04c6ff46e8591d016f258f7",
    "F03-scan.png": "404b901fd0a6eab5bb35d99a89af49277d696ceebec043ea6e6fabd755872a48",
    "F04-logo-transparent.png": "3309a860b612253e9187347eaa20c576b60f730fd19f537c5e7a28391822381b",
    "F05-benchmark-100p.pdf": "3199e92b935991f31d3b134fa8c907f059bcda243158390f81c681be25883de0",
    "F06-benchmark-500p.pdf": "dc42b78cbd6db7c5b90b09a005875ad848d28b19632d47675499adbeb329e078",
    "F07-records.csv": "57b93cf4b25ab3ffcba7d4bd3835226a17131ee7a2673d628d40b22ab5cfd035",
    "F08-invalid.pdf": "4b5d13574199bf3aaa8d6f6059073f4101de89e4b878ab2b59ea32a25026a874",
}
failures = []
for name, expected in EXPECTED.items():
    file_path = ROOT / name
    if not file_path.is_file():
        failures.append({"file": name, "status": "MISSING"})
        continue
    observed = sha256(file_path.read_bytes()).hexdigest()
    if observed != expected:
        failures.append({"file": name, "status": "SHA256_MISMATCH", "expected": expected, "observed": observed})
print(json.dumps({
    "status": "PASS" if not failures else "FAIL_CLOSED",
    "source": "PDFHub-Synthetic-Input-Fixtures-v1.zip",
    "sha256_recorded_files": len(EXPECTED),
    "failures": failures,
}, indent=2))
if failures:
    sys.exit(1)
