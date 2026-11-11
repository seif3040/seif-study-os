import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function HabitsGoalsScreen() {
  const utils = trpc.useUtils();
  const habits = trpc.habits.list.useQuery();
  const goals = trpc.goals.list.useQuery();
  const [habit, setHabit] = useState("");
  const [goal, setGoal] = useState("");
  const createHabit = trpc.habits.create.useMutation({ onSuccess: async () => { setHabit(""); await utils.habits.list.invalidate(); } });
  const completeHabit = trpc.habits.complete.useMutation({ onSuccess: () => utils.habits.list.invalidate() });
  const createGoal = trpc.goals.create.useMutation({ onSuccess: async () => { setGoal(""); await utils.goals.list.invalidate(); } });
  const updateGoal = trpc.goals.updateProgress.useMutation({ onSuccess: () => utils.goals.list.invalidate() });
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable><Text style={styles.title}>العادات والأهداف</Text><Text style={styles.subtitle}>خلي التقدم ظاهر قدامك بدل ما يفضل في دماغك.</Text><Create value={habit} setValue={setHabit} placeholder="عادة يومية جديدة" action="أضف عادة" disabled={!habit.trim()} onPress={() => createHabit.mutate({ name: habit, frequency: "daily", target: 1 })} /><Create value={goal} setValue={setGoal} placeholder="هدف جديد" action="أضف هدف" disabled={!goal.trim()} onPress={() => createGoal.mutate({ title: goal })} />
    <Text style={styles.section}>عاداتك</Text>{(habits.data?.items ?? []).map(item => <View key={item.id} style={styles.row}><View style={styles.body}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.muted}>{item.frequency === "daily" ? "يومي" : "أسبوعي"} · target {item.target}</Text></View><Pressable onPress={() => completeHabit.mutate({ habitId: item.id })} style={styles.small}><Text style={styles.smallText}>{(habits.data?.completedIds ?? []).includes(item.id) ? "تم ✓" : "أنجز"}</Text></Pressable></View>)}
    <Text style={styles.section}>أهدافك</Text>{(goals.data ?? []).map(item => <View key={item.id} style={styles.row}><View style={styles.body}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.muted}>{item.progress}% مكتمل</Text></View><Pressable onPress={() => updateGoal.mutate({ goalId: item.id, progress: Math.min(100, item.progress + 10) })} style={styles.small}><Text style={styles.smallText}>+10%</Text></Pressable></View>)}
  </ScrollView></ScreenContainer>;
}
function Create({ value, setValue, placeholder, action, disabled, onPress }: { value: string; setValue: (value: string) => void; placeholder: string; action: string; disabled: boolean; onPress: () => void }) { return <View style={styles.create}><TextInput value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{action}</Text></Pressable></View>; }
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 50 }, back: { color: colors.primary, textAlign: "right", fontWeight: "800", fontSize: 16 }, title: { color: colors.foreground, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 16 }, subtitle: { color: colors.muted, textAlign: "right", marginTop: 6, marginBottom: 18 }, create: { flexDirection: "row-reverse", gap: 8, marginBottom: 10 }, input: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 11, padding: 12, color: colors.foreground, textAlign: "right", backgroundColor: colors.surface }, primary: { backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 14, justifyContent: "center" }, primaryText: { color: "#fff", fontWeight: "900" }, disabled: { opacity: 0.45 }, section: { color: colors.foreground, textAlign: "right", fontWeight: "900", fontSize: 19, marginTop: 18, marginBottom: 7 }, row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 }, body: { flex: 1 }, rowTitle: { color: colors.foreground, textAlign: "right", fontWeight: "800" }, muted: { color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }, small: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10 }, smallText: { color: colors.primary, fontWeight: "800" },
});
