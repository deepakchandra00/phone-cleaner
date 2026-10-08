#!/usr/bin/env python3
"""Capture an already-open, verified Android screen; does not build or install."""
import argparse
from pathlib import Path
import shutil
import subprocess
NAMES = ['01-storage', '02-large-files', '03-duplicates', '04-compression', '05-review', '06-device-tools']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('screen', choices=NAMES)
parser.add_argument('--serial', help='adb device serial (required with multiple devices)')
args = parser.parse_args()
if not shutil.which('adb'):
    parser.error('adb is unavailable. Connect an Android device and install Android platform-tools first.')
command = ['adb'] + (['-s', args.serial] if args.serial else [])
result = subprocess.run(command + ['exec-out', 'screencap', '-p'], check=True, capture_output=True)
if not result.stdout.startswith(b'\x89PNG\r\n\x1a\n'):
    parser.error('Device did not return a PNG; no screenshot was saved.')
folder = Path(__file__).resolve().parents[1] / 'store-metadata/assets/screenshots/raw'
folder.mkdir(parents=True, exist_ok=True)
path = folder / (args.screen + '.png')
if path.exists():
    parser.error(f'{path} already exists; choose whether to archive it before recapturing.')
path.write_bytes(result.stdout)
print(path)
