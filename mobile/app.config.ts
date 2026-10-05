import type { ExpoConfig, ConfigContext } from "@expo/config";
import { withAndroidManifest } from "@expo/config-plugins";
import { version } from "./package.json";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const appBaseName = IS_DEV ? "Phone Cleaner (Dev)" : IS_PREVIEW ? "Phone Cleaner (Beta)" : "Phone Cleaner";
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
            (action: any) => action.$?.["android:name"] === "android.intent.action.MAIN",
          ) &&
          intent.category?.some(
            (category: any) => category.$?.["android:name"] === "android.intent.category.LAUNCHER",
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
    runtimeVersion: "1.0.0",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.phonecleaner.app${bundleSuffix}`,
    },
    android: {
      package: `com.phonecleaner.app${bundleSuffix}`,
      adaptiveIcon: {
        foregroundImage: "./src/assets/adaptive-icon.png",
        backgroundColor: "#0F172A",
      },
      permissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
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
          photosPermission: "Allow Phone Cleaner to access your photos and videos to detect duplicates and large files.",
          savePhotosPermission: "Allow Phone Cleaner to save photos.",
          isAccessMediaLocationEnabled: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./src/assets/icon.png",
          resizeMode: "contain",
          backgroundColor: "#0F172A",
        },
      ],
      "expo-sqlite",
      "expo-status-bar",
      "expo-web-browser",
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: process.env.ADMOB_APP_ID || "ca-app-pub-3940256099942544~3347511713",
          iosAppId: process.env.ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511",
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
-keep class com.phonecleaner.app.** { *; }
-keep class com.revenuecat.purchases.** { *; }
            `,
          },
        },
      ],
    ],
    extra: {
      ...config.extra,
      ...(process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId
        ? {
            eas: {
              projectId: process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
            },
          }
        : {}),
      revenueCatAndroidApiKey: "goog_xxxxxxxxxxxxxxxxxxxxx",
      posthogKey: "",
      sentryDsn: "",
    },
  };

  return withAndroidQueries(base);
};
