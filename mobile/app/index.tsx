import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useMobileAuth } from "@/hooks/use-mobile-auth";

export default function EntryScreen() {
  const { authenticated, loading } = useMobileAuth();
  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#0f766e" /></View>;
  return <Redirect href={authenticated ? "/(tabs)" : "/login"} />;
}
