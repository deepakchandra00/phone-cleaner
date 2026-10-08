# SmartCare global listing drafts

These are drafts for manual Play Console upload, not published listings or verified ranking forecasts. Current source display name is SmartCare: Phone Cleaner; existing SmartCare brands mean a separate availability/trademark review remains necessary.

## Keyword decisions

| Requested phrase | Treatment |
|---|---|
| Phone Cleaner | Main English title and natural description. |
| Storage Cleaner | Natural description of accessible storage review. |
| Clear Cache | Explain supported cache cleanup and manual app Settings; never claim clearing every app's private cache. |
| Boost Mobile | Excluded from promotional copy: no validated speed boost, and potential confusion with the telecom brand. |
| AI Storage Cleaner | Research candidate only. No AI model is implemented. Do not advertise it. |
| Duplicate Photo Compressor | Express as duplicate-photo review plus JPEG compression. They are separate actions, with originals preserved. |
| Find Space Hogs | Use for largest-file discovery. |
| System Data Cleaner | Excluded: no privileged system-data deletion feature exists. |

No country-specific search-volume evidence is available. High-volume and day-one ranking claims have not been validated. Measure localized store-search acquisition and conversion; do not keyword-stuff descriptions.

## Locales

English en-US, Spanish LATAM es-419, Portuguese Brazil pt-BR, German de-DE, Japanese ja-JP. Spanish LATAM is not a substitute for a Spain-specific listing. Each directory has title, short description and full description. Titles are consistently SmartCare: Phone Cleaner across these locale drafts for the branding correction. Titles <=30, short descriptions <=80 and full descriptions <=4000 characters are checked by the metadata regression test. Native-language editorial review is still required.

Manual publishing work: add each language in Play Console, upload matching translated screenshots after device verification, configure country availability, review permissions, privacy policy and Data Safety, and verify regional consent/AdMob configuration. Source changes do not publish or select distribution countries.

## Size target

Target: APK archive under 25 MB. Not yet verified or guaranteed: React Native, native libraries, ads and billing SDKs contribute fixed overhead. Runtime brand images total approximately 1.6 MB before packaging; store artwork is separate from runtime assets. New tools use platform APIs rather than adding heavyweight ML or image-codec dependencies. Release minification/resource shrinking and AAB delivery already exist. A universal APK and Play's per-device download/install sizes are different measurements.

When builds resume, check an actual release APK with `python3 scripts/check_android_size.py path/to/release.apk`. Inspect Play Console/bundletool per-device AAB estimates across supported ABIs. If the target fails, profile the actual archive before deciding whether to remove SDKs or change distribution. Do not display an under-25-MB claim in listing copy until demonstrated.

## Release gate

No upload yet: database/scan changes, native tools, compression, notifications, speed measurements and ads need an updated native build and device verification. Listing feature descriptions must match the shipped build. Do not publish these new-feature drafts against an older APK. Keep supported-file and permission limitations visible.

Sources: https://support.google.com/googleplay/android-developer/answer/9898842?hl=en and https://support.google.com/googleplay/android-developer/answer/9859152?hl=en
