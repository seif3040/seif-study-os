import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Seif Study OS",
  slug: "seif-study-os-mobile",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  scheme: "seifstudy",
  android: {
    package: "com.seif.studyos",
    adaptiveIcon: {
      backgroundColor: "#0f766e",
    },
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://seifstudy-ufsrnaxx.manus.space",
  },
  plugins: ["expo-router", "expo-secure-store"],
};

export default config;
