# Phone Cleaner release review — 7 October 2026

Status: source fixes implemented; production approval remains pending device verification.
No further build was started after the request to pause builds. An earlier preview build had already been submitted and does not contain the latest fixes.

## Findings and implemented changes

- Duplicate detection excluded small photos and relied on estimated size/dimension metadata for exact matching. All accessible photos are now candidates, and file hashes determine exact matches.
- Partial cached/native hashes skipped missing results. Missing hashes are retried; inaccessible filesystem paths are retried using their media URI. Native batches recover incomplete rows individually. SQLite hash writes are bounded between UI yields.
- Duplicate results show actual exact/visual hash coverage. Similar photos remain labeled separately and require review. Permission-limited, unreadable or unsupported media cannot be claimed as checked.
- The Files switcher conditionally added NativeWind shadow variables. The installed CSS interop warning serializes React props and can trigger React Navigation's throwing context getters. Removed that conditional shadow and the keyed animated wrapper. This matches the reported error, but the affected tabs still need device confirmation. Related upstream report: https://github.com/nativewind/nativewind/issues/1711
- Scanning now has a rotating indicator, pulse, active-step animation, smoothly interpolated actual progress, and an expandable explanation. Reduced motion is respected. Scanning never deletes files.
- Unknown app usage is no longer labeled as unused for 90 days; app icons now use their image URIs and zero-size rows avoid division by zero.
- Smart Clean proposes verified cache candidates and opens review. Personal downloads, WhatsApp media and photos are not automatically suggested. Explicit confirmation precedes deletion.
- Cleanup preserves the recommended original, deduplicates physical targets, acknowledges actual deletion results, retains failed selections, and prevents concurrent scanning/deletion.
- Locate routes to the indexed containing folder and highlights the target; unreadable locations are explained rather than fabricated.
- Usage-access declaration/settings handling, asynchronous installed-app inspection, selection state, startup hydration, scan indexing and misleading RAM claims were corrected earlier in this work.

## Local verification

TypeScript checks, ESLint and 78 tests pass. Tests cover safe Smart Clean candidates, preserved originals, partial deletion reconciliation, physical file aliases, operation locking, location parsing, visual-hash indexing and hash recovery.
These checks do not execute the native Android module or reproduce navigation on a physical device. Earlier Expo Doctor verification passed 21/21 checks.

## Notification controls added

- Weekly Sunday 11:00 WhatsApp review is the default preference, activated only when system notification permission is allowed. Daily reminders are optional with a validated user-selected time. With both enabled, Sunday replaces the daily reminder with the weekly review.
- Reminder controls are independent of the Pro scheduled-scan feature. Measured cleanup alerts require a completed scheduled scan with at least 300 MB of verified cache candidates and are capped at one per 24 hours.
- Reminder schedules use stable identifiers, are synchronized on startup/foreground, and are cancelled when disabled or resetting app data. Permission denial and scheduling failure are handled in Settings.
- Notification taps use an allowlist and open review-related screens after startup/onboarding is complete. No notification invokes deletion. No speed or per-app battery claims are made.
- Local checks include reminder plans, non-overlapping Sunday schedules, valid times, route restrictions and alert thresholds/cooldowns. Notification delivery, Android permission flow and cold/warm-start taps still require device testing; delivery times are approximate.

## Usage access and manual app-cache review

The generated local Android app manifest was still missing PACKAGE_USAGE_STATS. The permission is now declared there and in the tracked native module manifest, in addition to Expo configuration, so regenerated and native builds receive it. The installed APK cannot gain this declaration from a JavaScript update; a new native build/install is required.

The usage-settings action now uses the documented no-input intent on the main queue. Native diagnostics can report a missing declaration, and the UI explains when an updated Android app is needed. Granted usage access exposes real available last-used statistics rather than a constant zero.

App Manager now has an App settings action for manual Storage → Clear cache. Usage access does not confer the privileged permission to clear other apps' private caches. No saved app data is cleared by Phone Cleaner. The current minimum Android version is API 24 (Android 7); generic APIs are used but manufacturer-specific UI and restrictions still need device coverage.

Both native manifests parse and declare the permission. TypeScript and lint pass. Native compilation remains unverified while builds are paused.

## Memory and duplicate fixes after the reported native crash

The reported crash exhausted a 256 MB Android heap. Its failing text allocation does not identify the retained objects. Source fixes reduce risk but do not constitute a reproduced heap-profile result:

- Duplicate cards render at most six thumbnails. Full groups open a separate virtualized grid with bounded rendering windows. App Manager uses a bounded FlatList; file-list recycling pools are capped. Thumbnails use disk caching, no crossfade and lower-memory decoding, and the photo screens release the image memory cache on exit.
- Removed the full retained in-memory deletion index; targets resolve from the atomically committed SQLite index. The scanner no longer retains an unused large-files result array; initial selection caches no longer eagerly register every WhatsApp/cache item.
- Added development-only app Java/native heap snapshots for Files section changes and Photos navigation. These require the updated native module.

A definite visual-hashing bug was found in both native implementations: bounds-only BitmapFactory decoding intentionally returns null, but the previous Elvis-return treated that as failure and skipped hashing. Both now use a shared decoder that proceeds from valid dimensions, bounds the longest decoded side to 128 pixels, normalizes EXIF orientation and recycles owned bitmaps in finally. Existing photo hashes are invalidated when the engine/grouping version changes.

Matching now compares exact-group protected originals with other photos. Similar groups use pairwise verification, stable ordering, aspect-ratio checks and reject ambiguous flat visual hashes. A protected original may appear as the anchor in two groups; removable targets do not overlap. Equivalent visual features share one comparison representative, and long comparison loops yield to the UI. Counts distinguish groups, unique photos and extra copies. Incomplete visual coverage is explained.

Quick cleanup is available from Home. Storage deletion continues through review. Notification cleanup uses a separately enabled Android notification-listener service and requests dismissal only for clearable notifications. No notification content is saved/uploaded, ongoing notifications are excluded, and the UI does not equate a submitted dismissal request with acknowledged success. The obsolete native RAM-booster method was removed, and previously registered daily RAM tasks are unregistered on startup. Android app killing and speed-boost claims remain excluded.

JavaScript checks pass, including 5,000-photo exact-copy and recompressed visual-copy fixtures, compressed/exact combinations, reordered scans, ambiguous hashes and non-transitive similarity chains. Three Android/Robolectric regression tests were added for bounds-only decoding, extreme aspect ratio/stream cleanup and EXIF rotation. They were NOT run: builds remain paused and the local Java/Android environment is unavailable. Native compilation, real image fixtures, notification access and heap profiling are pending.

Before release, on a device with a 256 MB heap: capture memory before/after a >4,757-photo scan, open large duplicate groups, switch Photos/Files/Apps repeatedly at least ten times, and confirm stable retained memory with headroom and no OOM. Repeat with permissions denied/revoked and foreground/background transitions. Confirm a known image yields a non-null 16-character visual hash and verify expected exact/similar copies before any disposable-data deletion tests.

## Required before release

1. Confirm WhatsApp/App Manager switching repeatedly on the affected phone, including debug and release mode; capture the full stack if the error persists.
2. Use a controlled photo library with known exact copies, compressed similar copies, small images and unrelated burst photos. Compare expected groups and displayed hash coverage, under full and limited photo permissions.
3. Check long scans on a large library, app background/foreground transitions, memory use, responsiveness, animations and reduced motion.
4. Verify usage-access enable/disable and return-from-settings behavior, file location, manual photo selection and review actions across supported Android versions.
5. Test confirmed deletion, denied permission, cancelled Android prompts, inaccessible files and partial failures on disposable test data; ensure originals and unselected personal files remain.
6. Verify native compilation, permissions, signing and the release configuration when builds are available. The prior dependency audit also has outstanding advisories requiring release review; compatible fixes were not forced where upstream/tooling changes could break the app.

No device benchmark or comparative feature test against CCleaner has been completed. An equivalent or better claim is not supported by the current evidence.


## SmartCare tools and global listing update

User authorized implementation on 7 October. Display branding is now SmartCare: Phone Cleaner; package/scheme/EAS project identities remain unchanged. Brand clearance has not been obtained.

- SQLite writes now use one queued async writer connection with BEGIN IMMEDIATE transactions, bounded contention retries and a 1.5-second busy timeout. The independent reader uses WAL and a short timeout. Lock errors never reset the reader connection. Removed unused synchronous bulk writers; scan hash caching, cache invalidation and deletion-index writes use the queue. Failed photo comparison now fails the scan explicitly and preserves the previous completed result. Confirmed physical deletions still notify selection reconciliation if a later database update fails; such a failure requires rescan.
- Added six contention/transaction tests, including two real Node SQLite multi-connection tests. They verify genuine writer contention, committed-index visibility, rollback, queue recovery and bounded retry. These do not execute Expo SQLite on Android.
- Home links to Device Care. Native battery snapshots, supported Wi-Fi security details and usage-access-gated per-UID mobile/Wi-Fi data reports have source implementations. Unsupported readings and partial totals are explained. No per-app battery blame, VPN or exact billing claims.
- JPEG compression processes at most ten selected photos sequentially, downsamples with a heap headroom check, handles EXIF orientation, creates cache drafts and saves separate gallery copies after explicit permission/action. Original bytes are measured, non-saving outputs are discarded, and metadata removal is disclosed. Scan/cleanup/compression share an exclusion gate. Stop occurs after the current photo; navigation/backgrounding stops the remaining batch. Drafts are removed on exit, and abandoned drafts older than a day are reclaimed on the next compression request.
- Two more Android/Robolectric tests were added for compression/original preservation/GPS removal and invalid-input cleanup. All five native regression tests (including the earlier three photo-hash tests) remain UNRUN while builds are paused.
- Selected-package notification dismissal allows exclusions and bounded pages. It clears current eligible notifications, preserves ongoing notifications and does not permanently disable future notifications.
- Unused-app review supports 30/60/90 days and a filtered view. Unknown history, system apps and recent installs are excluded. Large-file review now has bounded 60-item pages with accurate total counts, rather than truncating at 100 rows.
- Speed estimates use Cloudflare's documented __down/__up endpoints with bounded streams, cancellation, request timeouts, a 60-second deadline, warm-up, five request-latency samples and three download/upload samples. Approximately 8 MB plus overhead. The UI discloses provider network/privacy behavior and the single-connection/sample-size limitation. Cancellation can wait for an in-flight request timeout (up to eight seconds). No actual speed test has been run; native/network/device validation remains required.
- Ad startup collects UMP consent before requesting ads; production app/unit IDs are checked, listener cleanup/error handling and bounded reloads were added. Success-screen opportunities expire after five seconds and cancel on blur/background; ads do not appear later on a different screen. AdMob privacy messages and production IDs must be configured in the account/build environment. Fill is not guaranteed.
- English, Spanish LATAM, Portuguese Brazil, German and Japanese listing drafts and caption translations are saved under store-metadata. These are not uploaded or approved; app interface translations and real localized screenshots are not completed. Native-language editorial review is pending. Keyword volume/ranking claims are unverified; AI, RAM boost and system-data-cleaning claims were removed. All requested phrases are documented in the keyword decisions table.
- Refreshed runtime image assets total approximately 176 KB; no heavyweight ML/codec/speed-test SDK was added. scripts/check_android_size.py enforces a strict under-25-MB target for a supplied APK. It passed synthetic fixture checks only. No application APK, AAB per-device download size or installed size has been measured. Release minification/shrinking and AAB delivery already exist.

Current verification: TypeScript, lint and 78 automated JS/SQLite tests pass. Five native tests are present but unrun. No build, export, install, store upload or benchmark was performed in this update.

Additional device gates: test permission refusal/revocation, compression orientation/quality/metadata/cancel/partial save on disposable JPEGs, memory headroom under scan navigation, shared-UID/mobile/Wi-Fi usage, unsupported battery/Wi-Fi readings, notification exclusions and reconnection, offline/slow/cancelled speed tests, consent refusal/revocation and post-clean ad/no-fill behavior. Global Play distribution/privacy/Data Safety and sensitive-permission eligibility remain account-dependent. External app locking and VPN protection remain outside this release scope.


## 2026-10-07: reported 13,177-file OOM, scan latency and branding

The Android log shows a 256 MB Java heap nearly exhausted (347 KB headroom). Fabric's event allocation is the failure site, not proof of what retained memory. No heap dump/device is available; root cause and complete crash resolution remain unverified.

Removed retained video/audio/download/large-file enumeration lists in favor of counters; basic scans no longer retain a separate photo list. Removed full-library index deduplication copies and eager duplicate deletion-target registration. Read hash-cache queries in bounded batches, count coverage without full Map-value array copies, release cache/enumeration references before grouping/indexing, clear decoded image cache before scans and throttle progress-store updates to 150 ms. Comparison uses pre-parsed bit words/popcount and elapsed-time yields instead of thousands of mandatory timers. Indexing uses at most 32 rows/768 bindings per call (412 calls for the 13,178-row test including one repeated ID, rather than one call per row), within the existing atomic transaction. Comparison failures now propagate through scanStorage instead of silently committing an empty duplicate report.

Automated evidence: 78 tests pass, including real SQLite 13,177-row persistence/tail/repeated-ID coverage and a 13,177-photo randomized fixture preserving exact copies, unique removal targets and protected originals. The synthetic comparison stage took approximately 2 seconds on this desktop and yielded hundreds of event-loop ticks. This excludes native hashing, disk reads, Android rendering and heap behavior; it is not a phone scan-time claim. Native tests remain unrun and builds remain paused.

Simplified compressor/photo-screen main content, moved diagnostic detail behind the existing information control, filtered the compressor list to JPEGs, replaced numeric quality labels with presets and kept important quality/metadata information in the save confirmation. Onboarding no longer promises scanning in seconds.

Brand exports replace launcher/adaptive/favicon assets and add the home logo. Play icon and feature graphic were visually inspected and verified against platform dimensions/color modes. Store submission materials are in store-metadata/PLAY_STORE_SUBMISSION.md. Privacy/terms URLs are configurable; unverified placeholder-domain links were removed. Publisher details, hosted policies, final Data safety answers and sensitive-permission eligibility require owner review. Real screenshots remain pending an updated app on a device; artwork is not a screenshot. No build/install/store upload or Android performance benchmark was performed.
