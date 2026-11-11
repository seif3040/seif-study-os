import { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function StudyHubScreen() {
  const utils = trpc.useUtils();
  const plan = trpc.studyPlan.list.useQuery();
  const habits = trpc.habits.list.useQuery();
  const goals = trpc.goals.list.useQuery();
  const exams = trpc.exams.list.useQuery();
  const decks = trpc.flashcards.list.useQuery();
  const notebooks = trpc.notebooks.list.useQuery();
  const analytics = trpc.analytics.overview.useQuery();
  const rewards = trpc.rewards.list.useQuery();
  const achievements = trpc.achievements.list.useQuery();
  const coins = trpc.coins.ledger.useQuery();
  const calendarWindow = useMemo(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    return { from, to };
  }, []);
  const calendar = trpc.calendar.list.useQuery(calendarWindow);
  const [subjectTitle, setSubjectTitle] = useState("");
  const [habitName, setHabitName] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [notebookTitle, setNotebookTitle] = useState("");
  const createSubject = trpc.studyPlan.createSubject.useMutation({ onSuccess: async () => { setSubjectTitle(""); await utils.studyPlan.list.invalidate(); } });
  const createHabit = trpc.habits.create.useMutation({ onSuccess: async () => { setHabitName(""); await utils.habits.list.invalidate(); } });
  const createGoal = trpc.goals.create.useMutation({ onSuccess: async () => { setGoalTitle(""); await utils.goals.list.invalidate(); } });
  const createExam = trpc.exams.create.useMutation({ onSuccess: async () => { setExamTitle(""); await utils.exams.list.invalidate(); } });
  const createDeck = trpc.flashcards.createDeck.useMutation({ onSuccess: async () => { setDeckTitle(""); await utils.flashcards.list.invalidate(); } });
  const createNotebook = trpc.notebooks.create.useMutation({ onSuccess: async () => { setNotebookTitle(""); await utils.notebooks.list.invalidate(); } });
  const uploadSource = trpc.notebooks.uploadSource.useMutation({ onSuccess: (_result, input) => utils.notebooks.sources.invalidate({ notebookId: input.notebookId }) });
  const completeHabit = trpc.habits.complete.useMutation({ onSuccess: () => utils.habits.list.invalidate() });
  const updateGoal = trpc.goals.updateProgress.useMutation({ onSuccess: () => utils.goals.list.invalidate() });
  const [message, setMessage] = useState("");
  const askNotebook = trpc.notebooks.ai.useMutation({ onSuccess: result => setMessage(contentText(result)) });

  async function pickSource(notebookId: number) {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/markdown", "application/pdf"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const mimeType = asset.mimeType === "application/pdf" ? "application/pdf" : asset.mimeType === "text/markdown" ? "text/markdown" : "text/plain";
    const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    uploadSource.mutate({ notebookId, fileName: asset.name, mimeType, contentBase64 });
  }

  const rows = plan.data?.rows ?? [];
  const activeLessons = rows.filter(row => row.lesson);
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable>
    <Text style={styles.title}>Study Hub</Text>
    <Text style={styles.subtitle}>كل مساحات المذاكرة في شاشة Native واحدة، والبيانات هي نفسها بتاعة الويب.</Text>

    <Section title="خطة المذاكرة" hint={`${activeLessons.length} درس محفوظ`}>
      <View style={styles.createRow}><TextInput value={subjectTitle} onChangeText={setSubjectTitle} placeholder="اسم مادة جديدة" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!subjectTitle.trim() || createSubject.isPending} onPress={() => createSubject.mutate({ title: subjectTitle })} style={styles.smallButton}><Text style={styles.smallButtonText}>أضف مادة</Text></Pressable></View>
      {rows.length === 0 ? <Empty text="لسه مفيش خطة. أضف مادة من الويب أو من النسخة الكاملة قريبًا." /> : rows.slice(0, 12).map((row, index) => <View key={`${row.subject?.id}-${row.chapter?.id}-${row.lesson?.id}-${index}`} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{row.lesson?.title ?? row.chapter?.title ?? row.subject?.title}</Text><Text style={styles.muted}>{row.subject?.title}{row.chapter?.title ? ` · ${row.chapter.title}` : ""}</Text></View><Text style={styles.progress}>{row.progress?.progress ?? 0}%</Text></View>)}
    </Section>

    <Section title="العادات والأهداف" hint="خطوة صغيرة كل يوم">
      <View style={styles.createRow}><TextInput value={habitName} onChangeText={setHabitName} placeholder="اسم عادة يومية" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!habitName.trim() || createHabit.isPending} onPress={() => createHabit.mutate({ name: habitName, frequency: "daily", target: 1 })} style={styles.smallButton}><Text style={styles.smallButtonText}>أضف عادة</Text></Pressable></View>
      <View style={styles.createRow}><TextInput value={goalTitle} onChangeText={setGoalTitle} placeholder="هدف جديد" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!goalTitle.trim() || createGoal.isPending} onPress={() => createGoal.mutate({ title: goalTitle })} style={styles.smallButton}><Text style={styles.smallButtonText}>أضف هدف</Text></Pressable></View>
      {(habits.data?.items ?? []).slice(0, 5).map(habit => <View key={habit.id} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{habit.name}</Text><Text style={styles.muted}>{habit.frequency === "daily" ? "يومي" : "أسبوعي"} · الهدف {habit.target}</Text></View><Pressable onPress={() => completeHabit.mutate({ habitId: habit.id })} style={styles.smallButton}><Text style={styles.smallButtonText}>{(habits.data?.completedIds ?? []).includes(habit.id) ? "تم ✓" : "أنجز"}</Text></Pressable></View>)}
      {(goals.data ?? []).slice(0, 4).map(goal => <View key={goal.id} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{goal.title}</Text><Text style={styles.muted}>{goal.progress}% مكتمل</Text></View><Pressable onPress={() => updateGoal.mutate({ goalId: goal.id, progress: Math.min(100, goal.progress + 10) })} style={styles.smallButton}><Text style={styles.smallButtonText}>+10%</Text></Pressable></View>)}
      {!habits.data?.items?.length && !goals.data?.length ? <Empty text="أضف عادة أو هدف من الويب؛ هتظهر هنا على طول." /> : null}
    </Section>

    <Section title="الامتحانات والفلاش كاردز" hint={`${exams.data?.length ?? 0} امتحان · ${decks.data?.length ?? 0} مجموعة`}>
      <View style={styles.createRow}><TextInput value={examTitle} onChangeText={setExamTitle} placeholder="اسم امتحان" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!examTitle.trim() || createExam.isPending} onPress={() => createExam.mutate({ title: examTitle })} style={styles.smallButton}><Text style={styles.smallButtonText}>أضف امتحان</Text></Pressable></View>
      <View style={styles.createRow}><TextInput value={deckTitle} onChangeText={setDeckTitle} placeholder="مجموعة فلاش كارد" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!deckTitle.trim() || createDeck.isPending} onPress={() => createDeck.mutate({ title: deckTitle })} style={styles.smallButton}><Text style={styles.smallButtonText}>أضف مجموعة</Text></Pressable></View>
      {(exams.data ?? []).slice(0, 4).map(exam => <View key={exam.exam.id} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{exam.exam.title}</Text><Text style={styles.muted}>{exam.subject ?? "بدون مادة"} · الجاهزية {exam.readiness}%</Text></View><Text style={styles.badge}>{exam.readiness >= 70 ? "جاهز" : "كمّل"}</Text></View>)}
      {(decks.data ?? []).slice(0, 4).map(deck => <View key={deck.id} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{deck.title}</Text><Text style={styles.muted}>{deck.stats.total} كارت · mastered {deck.stats.mastered}</Text></View><Text style={styles.badge}>{deck.stats.new} جديد</Text></View>)}
      {!exams.data?.length && !decks.data?.length ? <Empty text="الامتحانات والفلاش كاردز اللي تعملها على الويب محفوظة هنا." /> : null}
    </Section>

    <Section title="Notebook AI" hint="المصدر أولًا، دايمًا">
      <View style={styles.createRow}><TextInput value={notebookTitle} onChangeText={setNotebookTitle} placeholder="اسم دفتر جديد" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!notebookTitle.trim() || createNotebook.isPending} onPress={() => createNotebook.mutate({ title: notebookTitle })} style={styles.smallButton}><Text style={styles.smallButtonText}>إنشاء</Text></Pressable></View>
      {(notebooks.data ?? []).slice(0, 5).map(item => <View key={item.notebook.id} style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{item.notebook.title}</Text><Text style={styles.muted}>{item.noteCount} ملاحظة</Text></View><Pressable onPress={() => pickSource(item.notebook.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>{uploadSource.isPending ? "…" : "ارفع ملف"}</Text></Pressable></View>)}
      {notebooks.data?.[0] ? <View style={styles.aiBox}><TextInput value={message} onChangeText={setMessage} placeholder="اسأل داخل أول دفتر" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={askNotebook.isPending} onPress={() => askNotebook.mutate({ notebookId: notebooks.data![0].notebook.id, mode: "question", prompt: message || "لخص الملفات المرفوعة" })} style={styles.primary}><Text style={styles.primaryText}>{askNotebook.isPending ? "جارٍ البحث…" : "اسأل الملفات"}</Text></Pressable>{askNotebook.data ? <Text style={styles.answer}>{contentText(askNotebook.data)}</Text> : null}</View> : <Empty text="أنشئ دفتر وارفع PDF أو TXT أو MD، وسيفي هيدور جواه بس." />}
    </Section>

    <Section title="التحليلات والمكافآت" hint={`${coins.data?.summary.balance ?? rewards.data?.coins.balance ?? 0} Coins`}>
      <View style={styles.grid}><Metric label="دقائق مذاكرة" value={`${analytics.data?.metrics.studyMinutes ?? 0}`} /><Metric label="جلسات تركيز" value={`${analytics.data?.metrics.pomodoros ?? 0}`} /><Metric label="إنجازات مفتوحة" value={`${achievements.data?.unlocked ?? 0}`} /><Metric label="مكافآت مملوكة" value={`${analytics.data?.rewardsPurchased ?? 0}`} /></View>
      <Text style={styles.mutedRight}>سجل Coins: {coins.data?.entries.length ?? 0} حركة · التقويم القادم: {(calendar.data?.tasks.length ?? 0) + (calendar.data?.exams.length ?? 0)} عنصر</Text>
    </Section>
  </ScrollView></ScreenContainer>;
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) { return <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.hint}>{hint}</Text><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.empty}>{text}</Text>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => typeof part === "string" ? part : typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : "").join("\n").trim();
  return "تعذر عرض النتيجة الآن.";
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 50 }, back: { color: colors.primary, fontWeight: "800", textAlign: "right", fontSize: 16 }, title: { color: colors.foreground, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 16 }, subtitle: { color: colors.muted, textAlign: "right", lineHeight: 22, marginTop: 6, marginBottom: 16 }, section: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 13 }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }, sectionTitle: { color: colors.foreground, fontSize: 18, fontWeight: "900", textAlign: "right" }, hint: { color: colors.primary, fontSize: 12, fontWeight: "700" }, row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 11 }, rowBody: { flex: 1 }, rowTitle: { color: colors.foreground, fontWeight: "800", textAlign: "right" }, muted: { color: colors.muted, fontSize: 12, textAlign: "right", marginTop: 3 }, progress: { color: colors.primary, fontWeight: "900" }, badge: { backgroundColor: colors.primarySoft, color: colors.primary, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontWeight: "800" }, smallButton: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }, smallButtonText: { color: colors.primary, fontWeight: "800" }, empty: { color: colors.muted, textAlign: "right", lineHeight: 21, paddingVertical: 8 }, createRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 6 }, input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 11, color: colors.foreground, textAlign: "right" }, aiBox: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12, marginTop: 4 }, primary: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center", marginTop: 8 }, primaryText: { color: "#fff", fontWeight: "900" }, answer: { color: colors.foreground, textAlign: "right", lineHeight: 22, marginTop: 12 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, metric: { flex: 1, minWidth: "45%", backgroundColor: colors.background, borderRadius: 12, padding: 11 }, metricValue: { color: colors.primary, fontWeight: "900", fontSize: 20, textAlign: "right" }, mutedRight: { color: colors.muted, textAlign: "right", marginTop: 12, fontSize: 12 },
});
