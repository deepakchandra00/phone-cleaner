# Fixing the store/installed branding mismatch

The notice reports a difference between the installed app's name/icon and the store listing. Source assets and drafts now use the supplied green phone/broom identity and the canonical name SmartCare: Phone Cleaner. Changing a store image or sending an OTA update alone does not replace launcher resources in a shipped Android binary.

## Prepared source changes

Both Expo configurations reference matching standard/adaptive assets; all five prepared listing titles match the production name. The old S artwork is excluded from the current submission folder, and the exporter reads the approved green master. Light/dark themes, logo, splash, feature graphic and favicon match. The unsupported AI claim was removed from app.json. App/package/EAS identity was preserved. Existing ignored Android icon/splash resources were synchronized without compiling or prebuilding.

## Required before asking Google to review again

1. When builds resume, build a **production** AAB with a new versionCode for `com.rishi076.smartcare`, using the existing production EAS profile. Confirm its resolved name is SmartCare: Phone Cleaner. Do not upload a Dev/Beta variant, an older AAB or a different package.
2. Install the actual candidate through an internal test track. Verify the launcher name, standard/round/adaptive icons and splash on supported devices. Test an upgrade from the currently published version and a clean install on a disposable test device; check different launcher masks/light/dark modes. Mask PNG previews in this package do not replace this step.
3. In Play Console, audit the **default en-US listing, every translation, every custom listing and country-specific overrides**. Upload `assets/play-icon.png` wherever an icon is overridden. Set the app name consistently to SmartCare: Phone Cleaner. Old drafts on the local filesystem do not tell us the live Console state.
4. Replace outdated feature graphics/screenshots with the verified current green app. Capture real screens from the updated production candidate; do not upload mask simulations or mockups as screenshots. Match the description to functions that pass testing. Do not advertise unsupported AI, RAM boosting, universal private-cache deletion, battery repair or guaranteed Wi-Fi protection.
5. Associate the correct candidate and listing changes in the submission, check Publishing overview for unsubmitted/stale changes, complete release/permission/privacy tasks and request review. No Console modification or upload has been performed here. Google makes the approval decision.

## Reviewer note draft — use only after verification above

“We updated the app's production launcher icon and all applicable store-listing icons to the same green phone-and-broom artwork. The installed production name and listing name are SmartCare: Phone Cleaner. We also updated promotional assets and reviewed listing claims against the tested release. We verified these changes using the release candidate distributed through our test track.”

Attach the actual verified versionCode and evidence if requested. Do not send this note before those statements are true.

Builds remain paused. This is a prepared correction, not confirmation that the previously submitted binary or live Play listing is already fixed.
