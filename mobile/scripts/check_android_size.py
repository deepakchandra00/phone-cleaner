#!/usr/bin/env python3
"""Check a supplied APK; does not build, install, upload or assume AAB size equals APK size."""
import argparse
from pathlib import Path
import zipfile
parser = argparse.ArgumentParser()
parser.add_argument("apk", type=Path)
parser.add_argument("--max-mb", type=float, default=25)
args = parser.parse_args()
if args.apk.suffix.lower() != ".apk" or not args.apk.is_file():
    parser.error("Supply a real APK file. AAB download/install sizes need bundletool or Play Console measurements.")
size = args.apk.stat().st_size
print(f"APK archive: {size / 1_000_000:.2f} MB (limit {args.max_mb:.2f} MB, decimal units)")
with zipfile.ZipFile(args.apk) as archive:
    totals = {}
    for entry in archive.infolist():
        category = entry.filename.split('/')[0]
        totals[category] = totals.get(category, 0) + entry.compress_size
    for name, count in sorted(totals.items(), key=lambda row: row[1], reverse=True)[:8]:
        print(f"  {name}: {count / 1_000_000:.2f} MB compressed")
raise SystemExit(0 if size < args.max_mb * 1_000_000 else 1)
