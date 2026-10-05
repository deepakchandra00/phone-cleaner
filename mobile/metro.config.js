const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts = [
  "js",
  "jsx",
  "json",
  "ts",
  "tsx",
  "cjs",
  "mjs",
  ...config.resolver.sourceExts,
];

module.exports = withNativeWind(config, { input: "./global.css" });
