import { useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { useKeepAwake } from "expo-keep-awake";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

const FOCUS_SECONDS = 45 * 60;
const BREAK_SECONDS = 15 * 60;
const formatTime = (value: number) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

export default function FocusScreen() {
  useKeepAwake();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "focus" | "break">("idle");
  const [remaining, setRemaining] = useState(FOCUS_SECONDS);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const start = trpc.pomodoro.start.useMutation();
  const pause = trpc.pomodoro.setPaused.useMutation();
  const complete = trpc.pomodoro.complete.useMutation();
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setRemaining(current => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!running || remaining > 0) return;
    if (phase === "focus") {
      if (sessionId) complete.mutate({ sessionId });
      setPhase("break"); setRemaining(BREAK_SECONDS);
    } else if (phase === "break") {
      setPhase("idle"); setRunning(false); setRemaining(FOCUS_SECONDS);
    }
  }, [remaining, running, phase, sessionId]);
  async function startFocus() {
    const result = await start.mutateAsync({ plannedMinutes: 45 });
    await Notifications.requestPermissionsAsync().catch(() => undefined);
    await Notifications.scheduleNotificationAsync({ content: { title: "خلصت جلسة التركيز", body: "استراحة 15 دقيقة يا بطل — اتحرك واشرب مية." }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: FOCUS_SECONDS } }).catch(() => undefined);
    setSessionId(result.id); setPhase("focus"); setRemaining(FOCUS_SECONDS); setRunning(true);
  }
  async function togglePause() {
    if (!sessionId) return;
    setRunning(current => !current);
    await pause.mutateAsync({ sessionId, paused: running });
  }
  const label = phase === "break" ? "استراحة مستحقة" : phase === "focus" ? "وقت التركيز" : "جاهز تبدأ؟";
  return <ScreenContainer style={styles.container}><Text style={styles.title}>Focus Lounge</Text><Text style={styles.subtitle}>45 دقيقة تركيز · 15 دقيقة راحة</Text><View style={styles.timer}><Text style={styles.phase}>{label}</Text><Text style={styles.time}>{formatTime(remaining)}</Text><Text style={styles.tip}>{phase === "break" ? "قوم اتحرك واشرب مية، وارجع أقوى." : "اقفل المشتتات وخلي الجلسة دي ليك."}</Text></View>{phase === "idle" ? <Pressable disabled={start.isPending} onPress={startFocus} style={styles.primary}>{start.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>ابدأ 45 دقيقة</Text>}</Pressable> : phase === "break" ? <Text style={styles.breakNotice}>المؤقت هيبدأ جلسة جديدة بعد الاستراحة.</Text> : <Pressable onPress={togglePause} style={styles.secondary}><Text style={styles.secondaryText}>{running ? "إيقاف مؤقت" : "كمّل الجلسة"}</Text></Pressable>}</ScreenContainer>;
}

const styles = StyleSheet.create({ container: { padding: 20, alignItems: "center" }, title: { color: colors.foreground, fontSize: 29, fontWeight: "900", textAlign: "center", marginTop: 30 }, subtitle: { color: colors.muted, marginTop: 7 }, timer: { width: "100%", backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 28, alignItems: "center", paddingVertical: 42, marginTop: 30, marginBottom: 20 }, phase: { color: colors.primary, fontWeight: "800", fontSize: 17 }, time: { color: colors.foreground, fontSize: 64, fontWeight: "900", marginVertical: 14, fontVariant: ["tabular-nums"] }, tip: { color: colors.muted, textAlign: "center", paddingHorizontal: 25 }, primary: { width: "100%", backgroundColor: colors.primary, padding: 16, borderRadius: 15, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "900", fontSize: 17 }, secondary: { width: "100%", backgroundColor: colors.primarySoft, padding: 16, borderRadius: 15, alignItems: "center" }, secondaryText: { color: colors.primary, fontWeight: "900", fontSize: 17 }, breakNotice: { color: colors.success, fontWeight: "800" },
});
