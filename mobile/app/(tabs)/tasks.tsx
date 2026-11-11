import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function TasksScreen() {
  const utils = trpc.useUtils();
  const tasks = trpc.tasks.list.useQuery();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"urgent" | "medium" | "low">("medium");
  const create = trpc.tasks.create.useMutation({ onSuccess: async () => { setTitle(""); await utils.tasks.list.invalidate(); } });
  const complete = trpc.tasks.complete.useMutation({ onSuccess: () => utils.tasks.list.invalidate() });
  const items = tasks.data ?? [];
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>مهامك النهارده</Text><Text style={styles.subtitle}>أنجز خطوة واضحة وخد Coins على الإكمال.</Text>
    <View style={styles.form}><TextInput value={title} onChangeText={setTitle} placeholder="إيه الخطوة الجاية؟" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.priorityRow}>{(["urgent", "medium", "low"] as const).map(value => <Pressable key={value} onPress={() => setPriority(value)} style={[styles.priority, priority === value && styles.priorityActive]}><Text style={priority === value ? styles.priorityTextActive : styles.priorityText}>{value === "urgent" ? "عاجل" : value === "medium" ? "متوسط" : "منخفض"}</Text></Pressable>)}</View><Pressable disabled={!title.trim() || create.isPending} onPress={() => create.mutate({ title, priority, scheduledFor: new Date().toISOString().slice(0, 10) })} style={[styles.add, !title.trim() && styles.disabled]}><Text style={styles.addText}>{create.isPending ? "جارٍ الإضافة…" : "إضافة المهمة"}</Text></Pressable></View>
    {tasks.isLoading ? <ActivityIndicator color={colors.primary} /> : items.length === 0 ? <Text style={styles.empty}>مفيش مهام لسه. ابدأ بأول خطوة.</Text> : items.map(task => <View key={task.id} style={styles.task}><View style={styles.taskBody}><Text style={[styles.taskTitle, task.status === "completed" && styles.done]}>{task.title}</Text><Text style={styles.taskMeta}>{task.priority === "urgent" ? "عاجل" : task.priority === "medium" ? "متوسط" : "منخفض"}{task.category ? ` · ${task.category}` : ""}</Text></View><Pressable disabled={task.status === "completed" || complete.isPending} onPress={() => complete.mutate({ taskId: task.id })} style={[styles.check, task.status === "completed" && styles.checked]}><Text style={styles.checkText}>{task.status === "completed" ? "✓" : "تم"}</Text></Pressable></View>)}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 12, paddingBottom: 30 }, title: { fontSize: 28, fontWeight: "900", textAlign: "right", color: colors.foreground }, subtitle: { textAlign: "right", color: colors.muted, marginBottom: 8 }, form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, gap: 10 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, textAlign: "right", color: colors.foreground, fontSize: 16 }, priorityRow: { flexDirection: "row-reverse", gap: 7 }, priority: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9, alignItems: "center" }, priorityActive: { backgroundColor: colors.primary, borderColor: colors.primary }, priorityText: { color: colors.muted, fontWeight: "700" }, priorityTextActive: { color: "#fff", fontWeight: "800" }, add: { backgroundColor: colors.primary, alignItems: "center", borderRadius: 12, padding: 13 }, addText: { color: "#fff", fontWeight: "800" }, disabled: { opacity: 0.45 }, task: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, flexDirection: "row-reverse", alignItems: "center", gap: 12 }, taskBody: { flex: 1 }, taskTitle: { color: colors.foreground, fontSize: 16, fontWeight: "800", textAlign: "right" }, taskMeta: { color: colors.muted, textAlign: "right", marginTop: 5 }, done: { textDecorationLine: "line-through", color: colors.muted }, check: { width: 48, height: 38, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }, checked: { backgroundColor: "#dcfce7" }, checkText: { color: colors.primary, fontWeight: "900" }, empty: { textAlign: "center", color: colors.muted, padding: 30 },
});
