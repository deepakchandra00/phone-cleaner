# Data safety and App content worksheet — publisher review required

Do not submit “No data collected” simply because photo analysis is local. The declaration covers the complete shipped app and third-party SDKs. This worksheet records source behavior, not final certified Console answers.

| Data / service | Observed source behavior | Work before submission |
|---|---|---|
| Photos/files and content hashes | Local scan, SQLite index, compression; no photo-upload endpoint in these features | Confirm release network behavior and all included SDKs; local processing alone is not off-device collection |
| Usage statistics/app inventory | Local visible-app review, usage/data statistics after special access | Confirm native package queries and avoid logging personal inventory in production |
| Notifications | Local app/package/key inventory for current dismissible notifications | Verify access disclosure and no content logging/upload |
| Advertising | Google Mobile Ads present; consent-first initialization, production IDs required | Use Google's SDK disclosure for identifiers, approximate location, interactions/diagnostics and configured mediation partners; verify collection/sharing/purpose/optional flags |
| Purchases | RevenueCat and Google billing present, anonymous app-user ID configuration | Check actual RevenueCat data types, purchase history, identifiers, purposes and handling |
| Speed test | Optional Cloudflare requests, provider can see source IP; approximately 8 MB per completed test | Review ephemeral handling and provider retention; do not infer exemption without confirming |
| Analytics/crash reporting | Current analytics shim logs only in development; no configured telemetry transport | Check release dependencies, network capture and any future SDK integrations |
| Support requests | No in-app form; future published support email may collect user messages | Define handling, retention and deletion contact before policy publication |

Final Console answers also require: encrypted transport, account creation/deletion (current product has no login/account creation), security practices, required/optional data, purposes, collection/sharing exemptions where applicable, retention, publisher contact and privacy-policy URL. Answer from the actual release binary and provider contracts, not this table alone.

Sources checked 2026-10-07:
- Google User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- Google Mobile Ads disclosure: https://developers.google.com/admob/android/privacy/play-data-disclosure
- RevenueCat disclosure guidance: https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety
- Account-deletion guidance: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
