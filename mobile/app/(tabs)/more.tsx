import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { useMobileAuth } from "@/hooks/use-mobile-auth";

const items = [
  { title: "سيفي المساعد", detail: "محادثات وأوامر بالمصري", route: "/assistant" },
  { title: "فيديو المذاكرة", detail: "جلسات 45/15 وملاحظات", route: "/video" },
];
export default function MoreScreen() {
  const { signOut } = useMobileAuth();
  return <ScreenContainer><View style={styles.content}><Text style={styles.title}>كل أدواتك</Text><Text style={styles.subtitle}>النسخة Native هتكبر معاك وتفضل على نفس بيانات الويب.</Text>{items.map(item => <Pressable key={item.route} onPress={() => router.push(item.route as never)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}><View><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemDetail}>{item.detail}</Text></View><Text style={styles.arrow}>‹</Text></Pressable>)}<Pressable onPress={async () => { await signOut(); router.replace("/login"); }} style={styles.logout}><Text style={styles.logoutText}>تسجيل الخروج</Text></Pressable><Text style={styles.version}>Seif Study OS Mobile · v1 foundation</Text></View></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 20 }, title: { color: colors.foreground, fontSize: 29, fontWeight: "900", textAlign: "right" }, subtitle: { color: colors.muted, textAlign: "right", lineHeight: 22, marginTop: 6, marginBottom: 20 }, item: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 17, marginBottom: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, itemTitle: { color: colors.foreground, textAlign: "right", fontWeight: "900", fontSize: 16 }, itemDetail: { color: colors.muted, textAlign: "right", marginTop: 5 }, arrow: { color: colors.primary, fontSize: 28 }, pressed: { opacity: 0.75 }, logout: { borderColor: colors.error, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: "center", marginTop: 15 }, logoutText: { color: colors.error, fontWeight: "900" }, version: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 30 },
});
