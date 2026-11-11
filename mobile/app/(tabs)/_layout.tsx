import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/constants/theme";

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { height: 66, paddingBottom: 9, paddingTop: 7, backgroundColor: colors.surface, borderTopColor: colors.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="tasks" options={{ title: "المهام", tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="focus" options={{ title: "التركيز", tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: "المزيد", tabBarIcon: ({ color, size }) => <Ionicons name="apps-outline" color={color} size={size} /> }} />
  </Tabs>;
}
