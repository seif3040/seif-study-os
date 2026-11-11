import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function CalendarScreen() {
  const utils = trpc.useUtils();
  const range = useMemo(() => { const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from); to.setDate(to.getDate() + 30); return { from, to }; }, []);
  const calendar = trpc.calendar.list.useQuery(range);
  const [title, setTitle] = useState("");
  const create = trpc.calendar.create.useMutation({ onSuccess: async () => { setTitle(""); await utils.calendar.list.invalidate(range); } });
  const rows = [
    ...(calendar.data?.tasks ?? []).map(item => ({ key: `task-${item.id}`, title: item.title, type: "مهمة", date: item.deadline })),
    ...(calendar.data?.exams ?? []).map(item => ({ key: `exam-${item.id}`, title: item.title, type: "امتحان", date: item.scheduledAt })),
    ...(calendar.data?.goals ?? []).map(item => ({ key: `goal-${item.id}`, title: item.title, type: "هدف", date: item.deadline })),
    ...(calendar.data?.events ?? []).map(item => ({ key: `event-${item.id}`, title: item.title, type: "حدث", date: item.startsAt })),
  ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable><Text style={styles.title}>التقويم الدراسي</Text><Text style={styles.subtitle}>شوف الشهر الجاي في صورة واحدة، وسجّل المواعيد المهمة.</Text><View style={styles.create}><TextInput value={title} onChangeText={setTitle} placeholder="اسم حدث جديد" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!title.trim()} onPress={() => create.mutate({ title, startsAt: new Date(), eventType: "custom" })} style={[styles.primary, !title.trim() && styles.disabled]}><Text style={styles.primaryText}>أضف</Text></Pressable></View><Text style={styles.section}>الأحداث القادمة ({rows.length})</Text>{rows.length ? rows.map(row => <View key={row.key} style={styles.row}><View style={styles.body}><Text style={styles.rowTitle}>{row.title}</Text><Text style={styles.muted}>{row.type} · {row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "بدون موعد"}</Text></View><Text style={styles.dot}>•</Text></View>) : <Text style={styles.empty}>مفيش أحداث في المدى الحالي.</Text>}<Text style={styles.section}>جلسات Pomodoro مكتملة: {calendar.data?.sessions.length ?? 0}</Text></ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 50 }, back: { color: colors.primary, fontWeight: "800", textAlign: "right", fontSize: 16 }, title: { color: colors.foreground, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 16 }, subtitle: { color: colors.muted, textAlign: "right", lineHeight: 22, marginTop: 6, marginBottom: 18 }, create: { flexDirection: "row-reverse", gap: 8 }, input: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 11, padding: 12, color: colors.foreground, textAlign: "right" }, primary: { backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 18, justifyContent: "center" }, primaryText: { color: "#fff", fontWeight: "900" }, disabled: { opacity: 0.45 }, section: { color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: "right", marginTop: 22, marginBottom: 9 }, row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 }, body: { flex: 1 }, rowTitle: { color: colors.foreground, fontWeight: "800", textAlign: "right" }, muted: { color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }, dot: { color: colors.primary, fontSize: 25 }, empty: { color: colors.muted, textAlign: "center", padding: 30 },
});
