module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      "react-native-reanimated/plugin",
      [
        "module:react-native-dotenv",
        {
          moduleName: "@env",
          path: ".env",
          allowlist: ["POSTHOG_KEY", "REVENUECAT_ANDROID_KEY"],
          safe: false,
          allowUndefined: true,
        },
      ],
    ],
  };
};
