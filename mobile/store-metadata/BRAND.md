# SmartCare brand assets

The original cyan/blue S and central sparkle represent organizing storage. No third-party cleaner logo is used. The generated visual concept is retained in `assets/brand/generated-concept.png`; the production mark is clean original vector artwork, with deterministic PNG exports, for crisp edges and Android safe-zone sizing.

- `assets/play-icon.png`: 512 × 512 RGBA PNG, below 1 MB. Upload to Play Console.
- `assets/feature-graphic.png`: 1024 × 500 RGB PNG without alpha. Upload to Play Console.
- `assets/brand/logo.{svg,png}`: transparent symbol.
- `assets/brand/wordmark.{svg,png}`: horizontal SmartCare wordmark.
- `assets/brand/launcher.png`: 1024 × 1024 launcher icon; copied to app assets.
- `assets/brand/adaptive-foreground.png`: transparent Android adaptive foreground, inside its safe circle; copied to app assets. Background stays navy.
- Matching SVG source accompanies each export. `scripts/export-brand.cjs` rasterizes the vector assets with sharp (a development tool, not an app dependency).

Suggested feature-graphic alt text: “Review files and photo copies with SmartCare to make room for what matters.”
Suggested icon alt text: “SmartCare cyan and blue S with a white sparkle.”

Generated concept prompt: “logo-brand. Create an original premium app logo SYMBOL ONLY for SmartCare, an Android storage organizer and phone cleaner. A simple bold distinctive flowing S monogram formed from two smooth rounded ribbons, clean cyan-to-blue gradients, with a small white negative-space four-point sparkle at the center where the two curves meet. Elegant geometric, approachable, precise, vector-like edges, recognizable at 24 pixels, flat front view. Symbol centered and occupying central 60% of a square 1024 by 1024 canvas. Truly transparent background. No text, no letters other than abstract S shape, no border, no device mockup, no shadow outside the symbol, no 3D, no shield, no broom, no rocket, no copied branding. This will be the master transparent logo for an app icon and Play Store feature graphic.”

Specifications checked against https://support.google.com/googleplay/android-developer/answer/9866151?hl=en on 2026-10-07. Name/trademark clearance remains the publisher's responsibility; no availability/ranking guarantee was made.
