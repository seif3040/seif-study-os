import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function PlanScreen() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.studyPlan.list.useQuery();
  const [subjectTitle, setSubjectTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const firstSubject = data?.rows.find(row => row.subject)?.subject;
  const firstChapter = data?.rows.find(row => row.chapter)?.chapter;
  const refresh = () => utils.studyPlan.list.invalidate();
  const createSubject = trpc.studyPlan.createSubject.useMutation({ onSuccess: async () => { setSubjectTitle(""); await refresh(); } });
  const createChapter = trpc.studyPlan.createChapter.useMutation({ onSuccess: async () => { setChapterTitle(""); await refresh(); } });
  const createLesson = trpc.studyPlan.createLesson.useMutation({ onSuccess: async () => { setLessonTitle(""); await refresh(); } });
  const progress = trpc.studyPlan.updateProgress.useMutation({ onSuccess: refresh });
  const complete = trpc.studyPlan.complete.useMutation({ onSuccess: refresh });
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable><Text style={styles.title}>خطة المذاكرة</Text><Text style={styles.subtitle}>ابني المادة على مراحل، وتابع تقدم كل درس من نفس قاعدة البيانات.</Text>
    <Form label="مادة جديدة" value={subjectTitle} onChange={setSubjectTitle} action="أضف مادة" disabled={!subjectTitle.trim() || createSubject.isPending} onPress={() => createSubject.mutate({ title: subjectTitle })} />
    <Form label="فصل داخل أول مادة" value={chapterTitle} onChange={setChapterTitle} action="أضف فصل" disabled={!chapterTitle.trim() || !firstSubject || createChapter.isPending} onPress={() => firstSubject && createChapter.mutate({ subjectId: firstSubject.id, title: chapterTitle })} />
    <Form label="درس داخل أول فصل" value={lessonTitle} onChange={setLessonTitle} action="أضف درس" disabled={!lessonTitle.trim() || !firstChapter || createLesson.isPending} onPress={() => firstChapter && createLesson.mutate({ chapterId: firstChapter.id, title: lessonTitle, estimatedMinutes: 45 })} />
    {isLoading ? <Text style={styles.empty}>جارٍ تحميل الخطة…</Text> : data?.rows.length ? data.rows.map((row, index) => row.lesson ? <View key={`${row.lesson.id}-${index}`} style={styles.card}><View style={styles.body}><Text style={styles.cardTitle}>{row.lesson.title}</Text><Text style={styles.muted}>{row.subject?.title} · {row.chapter?.title} · {row.lesson.estimatedMinutes} دقيقة</Text></View><View style={styles.controls}><Text style={styles.percent}>{row.progress?.progress ?? 0}%</Text><Pressable onPress={() => row.progress?.status === "completed" ? null : progress.mutate({ lessonId: row.lesson!.id, progress: Math.min(99, (row.progress?.progress ?? 0) + 10) })} style={styles.small}><Text style={styles.smallText}>+10%</Text></Pressable><Pressable onPress={() => complete.mutate({ lessonId: row.lesson!.id })} style={styles.small}><Text style={styles.smallText}>تم</Text></Pressable></View></View> : null) : <Text style={styles.empty}>ابدأ بإضافة مادة، وبعدها فصل ودرس.</Text>}
  </ScrollView></ScreenContainer>;
}
function Form({ label, value, onChange, action, disabled, onPress }: { label: string; value: string; onChange: (value: string) => void; action: string; disabled: boolean; onPress: () => void }) { return <View style={styles.form}><TextInput value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.primaryText}>{action}</Text></Pressable></View>; }
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 50 }, back: { color: colors.primary, fontWeight: "800", textAlign: "right", fontSize: 16 }, title: { color: colors.foreground, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 16 }, subtitle: { color: colors.muted, textAlign: "right", lineHeight: 22, marginBottom: 16, marginTop: 6 }, form: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, gap: 8 }, input: { borderColor: colors.border, borderWidth: 1, borderRadius: 11, padding: 12, color: colors.foreground, textAlign: "right" }, primary: { backgroundColor: colors.primary, borderRadius: 11, padding: 12, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "900" }, disabled: { opacity: 0.45 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 9, flexDirection: "row-reverse", gap: 10 }, body: { flex: 1 }, cardTitle: { color: colors.foreground, fontWeight: "900", textAlign: "right", fontSize: 16 }, muted: { color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }, controls: { alignItems: "center", gap: 6 }, percent: { color: colors.primary, fontWeight: "900" }, small: { backgroundColor: colors.primarySoft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 }, smallText: { color: colors.primary, fontSize: 12, fontWeight: "800" }, empty: { color: colors.muted, textAlign: "center", padding: 30 },
});
