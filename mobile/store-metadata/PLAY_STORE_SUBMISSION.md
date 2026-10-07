# SmartCare Play Store submission package

Status: artwork and listing drafts prepared; **not ready to upload a production release**. Builds remain paused. No real-device screenshots, release AAB, Android heap profile or Play Console submission has been completed.

## Prepared

- Display name: SmartCare: Phone Cleaner. Existing package/EAS identity preserved.
- Store icon: `assets/play-icon.png` (512 × 512 RGBA, <1 MB).
- Feature graphic: `assets/feature-graphic.png` (1024 × 500 RGB).
- Symbol/wordmark, launcher and Android adaptive foreground: `assets/brand/`; app asset paths updated.
- Listing title/short/full descriptions: en-US, es-419, pt-BR, de-DE, ja-JP directories. Native-language review remains pending. No search-volume, AI or performance claims without evidence.
- Screenshot storyboard/capture instructions: `assets/screenshots/README.md`; translated captions: `SCREENSHOT_COPY.md`.
- Privacy/terms drafts: `legal/`; Data safety worksheet: `DATA_SAFETY_WORKSHEET.md`.
- Suggested category: Tools. Tags must match the actual available Play Console choices and shipped features.
- Initial release-note draft: “Review storage, compare duplicate photos, preview smaller JPEG copies, and choose files to clean. Includes supported device information and optional reminders.” Use only once all listed functions pass release testing.

## Publisher details still required

Complete developer legal identity/contact, support email, website if available, publicly hosted HTTPS privacy policy, reviewed terms, intended audience/age groups, country distribution, pricing, trademark/name review, ads and billing configuration. Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL` to the verified hosted documents. The app no longer links to an unverified example domain.

Configure App content: privacy policy, Ads (“contains ads” if ads ship), app access (no login currently), content-rating questionnaire, target audience, Data safety and any applicable sensitive-permission declarations. Do not guess content-rating or children's-policy answers. All-files access is in source and requires a core-purpose justification and eligibility review; permissions and use must match the final release. Usage access, notification access and media permission flows need understandable disclosures.

## Release evidence required when builds resume

1. Build a signed production AAB for com.phonecleaner.app, verify version/versionCode, release target SDK, 64-bit/native-page-size requirements and signing in Play Console. The existing production EAS profile targets an app bundle; this task did not run it.
2. Verify 13k+ photos on a 256 MB-heap device: first/cached/rescan, files-tab navigation, scan while thumbnails have been viewed, partial permissions, unsupported images, failed reads and low storage. Profile Java/native/JS heap; the latest OOM is not considered resolved until repeated device runs pass.
3. Compare duplicates against a labeled set of known copies; check protected originals, review/confirmation, denied Android deletion, compressor previews/savings and saved copies. Confirm cancelled/error scans preserve previous index/results.
4. Test consent, production ad IDs/no-fill/offline, billing/restores and permissions on supported Android versions/manufacturers. Check native module tests and Play pre-launch report.
5. Capture at least two real screenshots; target six high-resolution verified phone screens. The capture script does not build/install. No placeholder image qualifies as a screenshot.
6. Inspect release download/install size by device/ABI. Under-25-MB remains a target, not a verified promise. Run `scripts/check_android_size.py` on an actual APK and inspect AAB delivery estimates.
7. Upload to internal/closed testing, satisfy any account-specific testing/production-access requirements, address crashes/ANRs and then choose a staged production rollout. No upload/publishing has been performed.

## Sources

- Graphics and screenshot requirements: https://support.google.com/googleplay/android-developer/answer/9866151?hl=en
- User Data/privacy policy: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- All-files permission policy: https://support.google.com/googleplay/android-developer/answer/10467955?hl=en
- Current target API requirement: https://support.google.com/googleplay/android-developer/answer/11926878?hl=en (verify for the intended upload date)

Play requirements can change. Recheck account-specific Console tasks and current requirements immediately before submission.
