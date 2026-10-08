# SmartCare green brand — 2026-10-08

Canonical production name: **SmartCare: Phone Cleaner**, shared by every prepared listing locale. App/package identity stays `com.rishi076.smartcare`; development and preview variants retain separate names/packages and must not be submitted as the production app.

The user supplied `Glossy Green Phone Cleaner Icon.png`. `assets/brand/user-reference.png` preserves it. The transparent foreground in `assets/brand/green-master.png` was prepared using imagegen, preserving the phone, green broom, white sparkles and luminous sweeping ribbon while removing the rounded-square backplate and outer white canvas. This single foreground supplies all current brand assets. The previous blue S concept is archived outside the submission folder in `branding-archive/2026-10-07/`.

## Deliverables

- `assets/play-icon.png`: 512 × 512 RGBA/sRGB PNG, below 1 MB; direct downsample of the production launcher artwork. Upload this to every default/localized/custom listing that overrides the icon.
- `assets/feature-graphic.png`: 1024 × 500 RGB PNG, no alpha; matching green artwork and truthful storage-review message.
- `assets/brand/launcher.png`: 1024 × 1024 full-square green artwork, copied to `src/assets/icon.png` for standard launcher and splash.
- `assets/brand/adaptive-foreground.png`: transparent centered foreground, copied to `src/assets/adaptive-icon.png`.
- `assets/brand/adaptive-background.png`: green gradient, copied to `src/assets/adaptive-background.png`; configured in both Expo files.
- `assets/brand/logo.png` and `wordmark.png`: matching in-app symbol and SmartCare wordmark.
- Matching SVG layout sources embed the same raster foreground; they are not independent/redrawn logos.
- `assets/validation/mask-circle.png` and `mask-squircle.png`: simulated icon masks, **not screenshots from an installed app**.

`branding.json` defines canonical naming, theme colours and master-artwork path. `scripts/export-brand.cjs` uses sharp solely for deterministic platform sizing/layout/raster export; it never redraws the approved art. It synchronizes a pre-existing ignored Android resource tree without building/prebuilding, and future EAS regeneration uses the matching Expo assets. No app dependency was added.

Palette: darker green #15803D for light-mode buttons with white text; bright green #4ADE80 for dark-mode buttons with #052E16 text; pale-green #F7FCF8 light background; forest #061B11 dark background; #007A3D icon/splash fallback. Destructive actions stay red. Automated checks cover normal text and button-label contrast >=4.5:1 in both themes.

Alt text — icon: “Green broom and sparkling phone, the SmartCare app icon.”
Alt text — feature graphic: “SmartCare helps you review files and keep your favourites to make room for what matters.”

Image edit prompt: “Edit target: the supplied glossy green phone-cleaner icon. Prepare its production logo foreground on a truly transparent square canvas. Preserve the existing tilted dark-green smartphone, glossy green broom with white bristles, the three white sparkle shapes and green luminous sweeping ribbon around the phone as faithfully as possible: same arrangement, same illustration style, same colors and shapes. Remove ONLY the outer white canvas and green rounded-square backplate/background. No new symbols, no letters, no text, no extra objects. Keep the entire foreground composition uncut, with the visible phone, broom, sparkle and luminous sweep all inside the central 60 percent of the square canvas, leaving generous equal transparent margins for Android adaptive-icon masking. This single foreground will be reused without redrawing for the launcher and Play listing. Sharp clean edges, polished source-quality artwork.”

References: https://developer.android.com/distribute/google-play/resources/icon-design-specifications and https://support.google.com/googleplay/android-developer/answer/9866151?hl=en . Platform exports provide the required sizing/safe-area placement. Actual installed release verification is pending; no Play approval is implied.
