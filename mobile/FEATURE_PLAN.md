# SmartCare feature and release plan

Updated 7 October 2026. Implementation was authorized by the user on 7 October. Source display branding now uses SmartCare: Phone Cleaner. Builds remain paused under the existing instruction.

## Branding

Candidate title: **SmartCare: Phone Cleaner** (24 characters). It conveys a broader device-care scope while retaining the main search phrase. Existing SmartCare apps reduce distinctiveness; no trademark clearance or keyword-volume evidence has been obtained. Verify brand availability before renaming assets/configuration. Keep the existing package identifier if branding changes. No ranking or traffic guarantee.

## First: release blockers

1. Reproduce the SQLite lock failure. Serialize writes, migrate scan hash-cache writes to async operations, enable WAL, apply per-connection timeouts and bounded async contention retries. Do not close/reopen a healthy connection on SQLITE_BUSY/LOCKED. Preserve the last committed index on failure. WAL alone does not solve competing writers.
2. Report duplicate comparison failure/incomplete coverage honestly instead of returning an apparently successful empty result. Check cold/cached scans, navigation during indexing, cancellation and background transitions.
3. Verify memory use on a device with a 256 MB heap, repeated Photos/Files/Apps navigation and large groups. Native hashing fixes still need an updated APK and real fixtures.
4. Repair ad lifecycle/error diagnostics and consent-aware startup. Verify production AdMob configuration without exposing IDs or secrets. No guarantee of fill; ads never determine deletion success.

## Core storage and cleanup

- Improve space hogs using the existing paginated SQLite index. Add largest-file/type/folder summaries within accessible storage. Do not run a second unbounded recursive JavaScript scan or imply private app storage is accessible.
- Improve unused-app review with selectable thresholds and user-approved uninstall. Require usage access; distinguish measured last use from unknown/unavailable history and account for install dates and package visibility.
- Add photo compression with preview, measured before/after bytes, quality/resolution controls, orientation handling, documented metadata behavior, cancellation and bounded processing. Prefer an Expo-compatible image manipulator initially; evaluate native codec work only if benchmarks justify it. Save separate copies, skip outputs that do not save space, and require separate approval to delete originals. Conventional compression is not AI and no fixed savings/imperceptible-loss guarantee applies.
- Extend notification cleanup with package selection and exclusions. Use NotificationListenerService, not Accessibility, for dismissal. Clear current eligible notifications after explicit user action. New notifications can still arrive; permanent disabling belongs in Android Settings. Exclude ongoing/unclearable notifications and store no message content. Persistent suppression, if requested later, requires a separate opt-in design and cannot promise prevention of sound/display before cancellation.

## Device monitoring

- Per-app mobile/Wi-Fi usage through NetworkStatsManager after usage access. TrafficStats cannot inspect other UIDs on Android 7+. Handle unsupported queries, shared UIDs, system totals and sampling/time-bucket limitations. Present system-recorded usage, not exact live billing totals; no data blocking.
- Battery monitor: level, charging, temperature, voltage, system health status and supported current readings. Health status is not remaining-capacity percentage. Current uses BatteryManager properties rather than a broadcast extra; availability varies. No universal per-app drain attribution or battery repair claims. Avoid constant polling/background services by default.

## Network tools

- Wi-Fi security check: show supported security type and warn about open networks. Encryption does not verify hotspot trust or protect traffic. Handle version/permission restrictions. No VPN protection claim; VPN would be a separate product/infrastructure decision.
- Speed test: latency/download/upload using endpoints intended or controlled for measurement, bounded data consumption, cache avoidance, warm-up and cancellation. Select regional servers and disclose test data use. A timed dummy CDN fetch alone is not a validated general internet-speed test. Validate provider terms/costs and methodology before implementation.

## Security scope

Biometric protection for this app is feasible. External-app locking remains a separate feasibility prototype, not a first-release promise. SYSTEM_ALERT_WINDOW draws above apps but does not intercept launches or enforce access control; apps can hide overlays. Foreground detection, background limits, reboot/force-stop and revoked permissions require explicit evaluation. Accessibility use, if considered, needs separate disclosure and Play policy review.

## Global discovery and release

Prepare truthful English listing/screenshot copy and localize by target market. Candidate terms: phone cleaner, storage cleaner, duplicate photo cleaner, free up space and large file finder; add photo compressor only after delivery. Validate country-specific keyword demand rather than claim traffic from generic web searches. Support local dates/numbers, accessible layouts and regional ad/privacy choices. Verify Play distribution, privacy policy, Data Safety, media/all-files permissions and testing eligibility in the developer account before release.

## Sources

- https://developer.android.com/reference/android/net/TrafficStats
- https://developer.android.com/reference/android/app/usage/NetworkStatsManager
- https://developer.android.com/reference/android/app/usage/UsageStatsManager
- https://developer.android.com/reference/android/service/notification/NotificationListenerService
- https://developer.android.com/reference/android/os/BatteryManager
- https://developer.android.com/reference/android/net/wifi/WifiInfo
- https://developer.android.com/security/fraud-prevention/activities
- https://docs.expo.dev/versions/latest/sdk/imagemanipulator/
- https://docs.expo.dev/versions/latest/sdk/sqlite/
- https://support.google.com/googleplay/android-developer/answer/9898842?hl=en
- https://developers.google.com/admob/android/privacy
- https://play.google.com/store/apps/details?id=health.smartcare.patient
- https://play.google.com/store/apps/details?id=com.smartcaresoftware.smartcare


## Implementation status

See PRODUCTION_REVIEW.md for delivered source changes, current checks and release gates. SQLite write serialization/error handling, JPEG compression, unused-app filtering, paginated space hogs, package-selected notification cleanup, native battery/Wi-Fi/data tools, bounded speed estimates, consent/ad lifecycle fixes and localized listing drafts are implemented in source. Native compilation/device tests, real localized screenshots, interface translation, brand clearance, APK size measurement and Play/AdMob account configuration remain outstanding. No AI, system-data deletion, RAM booster, VPN or external-app lock is advertised as implemented.
