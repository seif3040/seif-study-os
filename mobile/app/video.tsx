import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

const FOCUS = 45 * 60;
const BREAK = 15 * 60;
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function VideoScreen() {
  const [url, setUrl] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "watching" | "break">("idle");
  const [remaining, setRemaining] = useState(FOCUS);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const start = trpc.video.start.useMutation();
  const heartbeat = trpc.video.heartbeat.useMutation();
  const setTimer = trpc.video.setExternalTimer.useMutation();
  const end = trpc.video.end.useMutation();
  useEffect(() => { if (phase !== "watching" && phase !== "break") return; const timer = setInterval(() => setRemaining(current => Math.max(current - 1, 0)), 1000); return () => clearInterval(timer); }, [phase]);
  useEffect(() => {
    if (remaining > 0 || phase === "idle") return;
    if (phase === "watching") { if (sessionId) { heartbeat.mutate({ sessionId, active: false }); setTimer.mutate({ sessionId, running: false }); } setPhase("break"); setRemaining(BREAK); }
    else { setPhase("idle"); setRemaining(FOCUS); }
  }, [remaining, phase, sessionId]);
  async function startSession() {
    const result = await start.mutateAsync({ videoUrl: url, lessonTitle: lessonTitle || undefined, requestedMode: "auto", subject: "other" });
    setSessionId(result.id); setPhase("watching"); setRemaining(FOCUS); await setTimer.mutateAsync({ sessionId: result.id, running: true });
    await Linking.openURL(url);
  }
  async function stop() { if (sessionId) await end.mutateAsync({ sessionId }); setSessionId(null); setPhase("idle"); setRemaining(FOCUS); }
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable><Text style={styles.title}>فيديو المذاكرة</Text><Text style={styles.subtitle}>شغّل الفيديو بأمان، والتطبيق هيتابع دورة 45/15.</Text>{phase === "idle" ? <View style={styles.form}><TextInput value={lessonTitle} onChangeText={setLessonTitle} placeholder="اسم الدرس (اختياري)" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={url} onChangeText={setUrl} placeholder="رابط YouTube أو المنصة" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" style={[styles.input, styles.ltr]} /><Pressable disabled={!url.trim() || start.isPending} onPress={startSession} style={[styles.primary, !url.trim() && styles.disabled]}>{start.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>ابدأ الفيديو والجلسة</Text>}</Pressable></View> : <View style={styles.timer}><Text style={styles.phase}>{phase === "watching" ? "وقت المشاهدة والتركيز" : "استراحة 15 دقيقة"}</Text><Text style={styles.time}>{clock(remaining)}</Text><Text style={styles.tip}>{phase === "watching" ? "الفيديو اتفتح، ركّز وخد ملاحظاتك." : "استراحة مستحقة. ارجع بعد ما تخلص."}</Text>{phase === "watching" ? <Pressable onPress={stop} style={styles.secondary}><Text style={styles.secondaryText}>إنهاء الجلسة</Text></Pressable> : null}</View>}</ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 40 }, back: { color: colors.primary, fontWeight: "800", textAlign: "right", fontSize: 16 }, title: { color: colors.foreground, fontSize: 29, fontWeight: "900", textAlign: "right", marginTop: 18 }, subtitle: { color: colors.muted, textAlign: "right", marginTop: 6, marginBottom: 20, lineHeight: 22 }, form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 15, gap: 12 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 13, color: colors.foreground, textAlign: "right", fontSize: 16 }, ltr: { textAlign: "left", writingDirection: "ltr" }, primary: { backgroundColor: colors.primary, padding: 15, borderRadius: 13, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "900" }, disabled: { opacity: 0.45 }, timer: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 25, alignItems: "center", padding: 30, marginTop: 10 }, phase: { color: colors.primary, fontWeight: "900", fontSize: 17 }, time: { color: colors.foreground, fontSize: 56, fontWeight: "900", marginVertical: 16 }, tip: { color: colors.muted, textAlign: "center", marginBottom: 20 }, secondary: { backgroundColor: colors.primarySoft, padding: 13, paddingHorizontal: 24, borderRadius: 12 }, secondaryText: { color: colors.primary, fontWeight: "900" },
});
