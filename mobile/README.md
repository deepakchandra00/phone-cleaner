# Phone Cleaner — React Native + Expo

Production-ready mobile app for the **Phone Cleaner** storage-cleaning utility.
Built with Expo SDK 52, React Native 0.76 (New Architecture), expo-router,
NativeWind (Tailwind on RN), Zustand + MMKV, and TanStack Query.

## What this is

A privacy-first Android storage cleaner:
- **No login** — install → scan → clean.
- **On-device scanning** — files never leave the phone.
- **Core loop**: Scan → Understand → Review → Clean.
- Monetised via AdMob (banner / native / interstitial / rewarded) + Pro subscription (RevenueCat).

## Requirements to run locally

- Node 20+, Bun or pnpm
- Expo CLI: `npm i -g eas-cli`
- Android Studio (for emulator) **or** a physical Android device with USB debugging
- Java 17 JDK (for native builds)

## Setup

```bash
cd mobile
bun install                 # or npm install
bun run prebuild            # generates android/ native project
bun run start               # starts Expo dev server (--dev-client)
# in another terminal:
bun run android             # builds & installs the dev client on device/emulator
```

> **Important:** This app uses native APIs (MediaStore, StorageStatsManager,
> package manager). It **cannot run in Expo Go** — you must use a **dev build**
> (`bun run prebuild` + `bun run android`, or `bun run build:dev` via EAS).

## Architecture

```
app/                      expo-router (file-based)
  _layout.tsx             Root: providers, status bar, stack
  index.tsx               Redirect: onboarding → home
  onboarding.tsx          3-screen permission education (Phase 2)
  (tabs)/                 Bottom-tab navigator
    home.tsx              Storage dashboard (Phase 1) ✓
    photos.tsx            Duplicate photos (Phase 5)
    scan.tsx              Scan results (Phase 3)
    files.tsx             Large files + WhatsApp (Phase 6)
    settings.tsx          Settings (Phase 8)
  scan-progress.tsx       Animated scan engine UI (Phase 3)
  review.tsx              Cleanup review modal (Phase 4)
  success.tsx             "You freed X GB" success (Phase 4)
  premium.tsx             Paywall (Phase 7)
  category/[key].tsx      Category drill-down (Phase 3)

src/
  theme/                  Colours (emerald/teal "clean" semantic)
  stores/
    useAppStore.ts        Zustand: storage, scan, selection, cleanup
    usePremiumStore.ts    Zustand: entitlement (RevenueCat-backed)
  lib/
    storage.ts            MMKV instance + typed JSON helpers
    format.ts             Byte / count / time formatters
    analytics.ts          PostHog shim (north-star: GB freed / MAU)
    mockData.ts           Simulated Android scanner (swap for native in prod)
    types.ts              Shared scanner types
    utils.ts              cn() class merger
  components/ui/          Button, Card, Progress, StorageRing, Icon, BottomNav, ScreenHeader
  components/features/    Feature-specific composite components
  hooks/                  useScanEngine, usePermissions
```

## Native modules (production)

The mock scanner in `src/lib/mockData.ts` is swapped for three custom Kotlin
modules exposed to JS via Expo Modules API:

| Module | Responsibility |
|---|---|
| `AndroidStorageModule` | `StorageStatsManager`, `PackageManager` (app sizes, cache) |
| `SAFBridge` | `StorageAccessFramework` (WhatsApp media, arbitrary folders) |
| `HashWorker` | Batched SHA-256 + pHash on a background thread |

Each ships as an Expo Config Plugin so EAS Build wires it automatically.

## Phases

| Phase | Status | What |
|---|---|---|
| 0–1 | ✅ | Foundation: scaffold, theme, stores, navigation, dashboard |
| 2 | ✅ | Onboarding + permission education |
| 3 | ✅ | Smart scan engine + results screen |
| 4 | ✅ | Cleanup review + success animation |
| 5 | ✅ | Duplicate photos (4-stage pipeline + keep-best) |
| 6 | ✅ | Large files + WhatsApp + App manager |
| 7 | ✅ | Premium paywall + RevenueCat |
| 8 | ✅ | Settings, analytics, ads, native module skeletons |

## Swapping mock → native (production)

The mock scanner in `src/lib/mockData.ts` mirrors the exact signatures of
three Kotlin native modules in `src/lib/native/AndroidStorageModule/`:

| Mock function | Native replacement |
|---|---|
| `getStorageSummary()` | `AndroidStorage.getStorageStats()` |
| `getApps()` | `AndroidStorage.getInstalledApps()` |
| `runScan()` | `AndroidStorage.getInstalledApps()` + `SAFBridge.listFiles()` + `HashWorker.hashFiles()` |

To wire in production:
1. Run `bun run prebuild` — generates `android/` with the modules.
2. Move the `.kt` files into `android/modules/` (Expo Modules auto-discovery).
3. Replace the `mockData.ts` imports in `useAppStore.ts` with native module calls.
4. Set `REVENUECAT_ANDROID_KEY` and AdMob app ID in `.env` / `app.config.ts`.

## Monetization

- **Free**: full cleaning features, ads (1 banner on home, native in scan results,
  interstitial after cleanup, rewarded for similar-photos scan).
- **Pro** ($9.99/yr): no ads, similar photos (pHash), scheduled scans, storage alerts,
  advanced WhatsApp rules, smart cleanup rules.

Entitlement is cached in MMKV (7-day TTL) so the UI never blocks on a network call.

## Privacy

- No login. No account. No cloud upload.
- All scanning is on-device.
- Analytics (PostHog) is opt-out and anonymous (install ID only).
