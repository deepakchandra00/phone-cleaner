import type { ExpoConfig, ConfigContext } from "@expo/config";
import {
  withAndroidManifest,
  withProjectBuildGradle,
} from "@expo/config-plugins";
import { version } from "./package.json";
import brand from "./branding.json";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const appBaseName = IS_DEV
  ? "SmartCare (Dev)"
  : IS_PREVIEW
    ? "SmartCare (Beta)"
    : brand.name;
const bundleSuffix = IS_DEV ? ".dev" : IS_PREVIEW ? ".beta" : "";

/**
 * Config plugin: injects <queries> into AndroidManifest.xml for Android 11+
 * package visibility. Without this, getInstalledApplications() only returns
 * the app itself. With this, all launcher-visible apps are visible.
 * Avoids QUERY_ALL_PACKAGES (Play Store rejection).
 */
function withAndroidQueries(config: ExpoConfig): ExpoConfig {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest as any;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const queries = manifest.queries as any[];

    // Check if launcher query already exists
    const hasLauncherQuery = queries.some((query) =>
      query.intent?.some(
        (intent: any) =>
          intent.action?.some(
            (action: any) =>
              action.$?.["android:name"] === "android.intent.action.MAIN",
          ) &&
          intent.category?.some(
            (category: any) =>
              category.$?.["android:name"] ===
              "android.intent.category.LAUNCHER",
          ),
      ),
    );

    if (!hasLauncherQuery) {
      queries.push({
        intent: [
          {
            action: [
              {
                $: {
                  "android:name": "android.intent.action.MAIN",
                },
              },
            ],
            category: [
              {
                $: {
                  "android:name": "android.intent.category.LAUNCHER",
                },
              },
            ],
          },
        ],
      });
    }

    return modConfig;
  });
}

/**
 * Config plugin: injects FileProvider into AndroidManifest.xml for native file opening.
 */
function withFileProvider(config: ExpoConfig): ExpoConfig {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest as any;
    const app = manifest.application?.[0];
    if (app) {
      if (!app.provider) app.provider = [];
      const hasFileProvider = app.provider.some(
        (p: any) =>
          p.$?.["android:name"] === "androidx.core.content.FileProvider",
      );
      if (!hasFileProvider) {
        app.provider.push({
          $: {
            "android:name": "androidx.core.content.FileProvider",
            "android:authorities": "${applicationId}.fileprovider",
            "android:exported": "false",
            "android:grantUriPermissions": "true",
          },
          "meta-data": [
            {
              $: {
                "android:name": "android.support.FILE_PROVIDER_PATHS",
                "android:resource": "@xml/file_paths",
              },
            },
          ],
        });
      }
    }
    return modConfig;
  });
}

/**
 * Config plugin: strips ACTIVITY_RECOGNITION and health-related permissions
 * using tools:node="remove" to prevent triggering Google Play Health Apps policy.
 */
function withStripHealthPermissions(config: ExpoConfig): ExpoConfig {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest as any;
    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }
    manifest["uses-permission"] = manifest["uses-permission"].filter(
      (p: any) =>
        p.$?.["android:name"] !== "android.permission.ACTIVITY_RECOGNITION",
    );
    manifest["uses-permission"].push({
      $: {
        "android:name": "android.permission.ACTIVITY_RECOGNITION",
        "tools:node": "remove",
      },
    });
    return modConfig;
  });
}

/**
 * Config plugin: forces Play Billing Library 8.0.0+ across all Gradle configurations
 * to satisfy Google Play Store latest monetization requirements.
 */
function withPlayBilling8(config: ExpoConfig): ExpoConfig {
  return withProjectBuildGradle(config, (modConfig) => {
    if (
      !modConfig.modResults.contents.includes(
        "com.android.billingclient:billing",
      )
    ) {
      modConfig.modResults.contents += `
allprojects {
  configurations.all {
    resolutionStrategy {
      force 'com.android.billingclient:billing:8.0.0'
      force 'com.android.billingclient:billing-ktx:8.0.0'
    }
  }
}
`;
    }
    return modConfig;
  });
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = {
    ...config,
    name: appBaseName,
    slug: "phone-cleaner",
    version,
    orientation: "portrait",
    icon: "./src/assets/icon.png",
    scheme: "phonecleaner",
    userInterfaceStyle: "automatic",
    runtimeVersion: { policy: "fingerprint" },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.rishi076.smartcare${bundleSuffix}`,
    },
    android: {
      package: `com.rishi076.smartcare${bundleSuffix}`,
      adaptiveIcon: {
        foregroundImage: "./src/assets/adaptive-icon.png",
        backgroundImage: "./src/assets/adaptive-background.png",
        backgroundColor: brand.iconBackground,
      },
      permissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.MANAGE_EXTERNAL_STORAGE",
        "android.permission.PACKAGE_USAGE_STATS",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.ACCESS_WIFI_STATE",
      ],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./src/assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-secure-store",
      "expo-notifications",
      "expo-asset",
      "expo-image",
      [
        "expo-media-library",
        {
          photosPermission:
            "Allow SmartCare to access your photos and videos to detect duplicates and large files.",
          savePhotosPermission: "Allow SmartCare to save photos.",
          isAccessMediaLocationEnabled: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./src/assets/icon.png",
          resizeMode: "contain",
          backgroundColor: brand.iconBackground,
        },
      ],
      "expo-sqlite",
      "expo-status-bar",
      "expo-web-browser",
      [
        "react-native-google-mobile-ads",
        {
          androidAppId:
            process.env.ADMOB_APP_ID ||
            "ca-app-pub-3940256099942544~3347511713",
          iosAppId:
            process.env.ADMOB_IOS_APP_ID ||
            "ca-app-pub-3940256099942544~1458002511",
          userTrackingUsageDescription:
            "This identifier will be used to deliver personalized ads to support this free cleaner.",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 24,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules: `
-keep class com.rishi076.smartcare.** { *; }
-keep class com.revenuecat.purchases.** { *; }
            `,
          },
        },
      ],
    ],
    extra: {
      ...config.extra,
      privacyPolicyUrl:
        process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
        config.extra?.privacyPolicyUrl ||
        "https://fieseros.com/phone-cleaner/privacy",
      termsUrl:
        process.env.EXPO_PUBLIC_TERMS_URL ||
        config.extra?.termsUrl ||
        "https://fieseros.com/phone-cleaner/terms",
      ...(process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId
        ? {
            eas: {
              projectId:
                process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
            },
          }
        : {}),
      admobProductionConfigured: Boolean(
        process.env.ADMOB_APP_ID &&
        !process.env.ADMOB_APP_ID.startsWith("ca-app-pub-3940256099942544"),
      ),
      revenueCatAndroidApiKey: process.env.REVENUECAT_ANDROID_KEY || "",
      posthogKey: "",
      sentryDsn: "",
    },
  };

  return withStripHealthPermissions(
    withPlayBilling8(withFileProvider(withAndroidQueries(base))),
  );
};
