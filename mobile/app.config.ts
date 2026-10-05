import type { ExpoConfig, ConfigContext } from "@expo/config";
import { version } from "./package.json";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const appBaseName = IS_DEV ? "Phone Cleaner (Dev)" : IS_PREVIEW ? "Phone Cleaner (Beta)" : "Phone Cleaner";
const bundleSuffix = IS_DEV ? ".dev" : IS_PREVIEW ? ".beta" : "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appBaseName,
  slug: "phone-cleaner",
  version,
  orientation: "portrait",
  icon: "./src/assets/icon.png",
  scheme: "phonecleaner",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
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
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED",
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
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          kotlinVersion: "1.9.25",
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
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
});
