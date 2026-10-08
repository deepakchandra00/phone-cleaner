# Real screenshots pending device capture

No screenshot images are included here: the updated app has not been run on a connected device, and native builds remain paused. Brand artwork is not an app screenshot. Do not upload placeholders or claim the screenshot requirement is complete.

Use a test device with non-personal sample photos, duplicates, videos and downloads. Grant the permissions needed for each demonstrated feature. Use the updated release candidate, finish its scan and verify the displayed results. Hide personal notifications and filenames; never modify displayed savings or pretend a feature works.

Recommended set: six portrait captures, ideally 1080 × 1920, with consistent locale/theme. Google permits phone screenshots with minimum dimension 320 px, maximum 3840 px, and long side no more than twice the short side. A listing needs at least two screenshots; four high-resolution screenshots improve eligibility for promotional display. Upload up to eight per supported device type. Do not submit tablet screenshots unless the actual tablet layout is verified.

1. Home: storage overview after a completed scan.
2. Files → Large files: real indexed items sorted by size.
3. Photos: exact/similar duplicate groups and visible review action.
4. Compress photos: prepared copies, measured before/after sizes, original comparison.
5. Cleanup review: explicit selections and confirmation action.
6. Device tools: supported battery/data readings, without personal app inventories.

Open each screen manually and run from the mobile directory:

```sh
python3 scripts/capture-play-screenshot.py 01-storage
```

Change the name for the other screens; `--serial DEVICE_SERIAL` selects a device. This script captures the current screen only and never builds, installs or navigates. Check each image for private data and honest feature representation before upload. For a device aspect ratio over 2:1, choose a suitable test-device display configuration or a different device before capture.

Captions in `../../SCREENSHOT_COPY.md` are drafts for EN, es-419, pt-BR, de-DE and ja-JP. Use the actual matching localized interface, or keep the raw English screenshot with a clearly translated explanatory caption. In-app localization is still pending.

Source: https://support.google.com/googleplay/android-developer/answer/9866151?hl=en
