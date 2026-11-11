import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function HomeScreen() {
  const summary = trpc.dashboard.summary.useQuery();
  if (summary.isLoading) return <ScreenContainer style={styles.center}><ActivityIndicator color={colors.primary} /></ScreenContainer>;
  const data = summary.data;
  const metrics = data?.metrics;
  return <ScreenContainer>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>اليوم الدراسي</Text>
      <Text style={styles.title}>صباح الخير يا Seif</Text>
      <Text style={styles.subtitle}>كل خطوة صغيرة بتقربك من هدفك.</Text>
      <View style={styles.coinCard}><Text style={styles.coinLabel}>الرصيد الحالي</Text><Text style={styles.coins}>{data?.coins.balance ?? 0} Coins</Text><Text style={styles.coinHint}>كمّل جلسة وخد مكافأتك</Text></View>
      <View style={styles.grid}>
        <Metric label="وقت المذاكرة" value={`${metrics?.studyMinutes ?? 0} د`} />
        <Metric label="الدروس المكتملة" value={`${metrics?.lessonsCompleted ?? 0}`} />
        <Metric label="المهام المكتملة" value={`${metrics?.tasksCompleted ?? 0}`} />
        <Metric label="Pomodoros" value={`${metrics?.pomodoros ?? 0}`} />
      </View>
      <Text style={styles.sectionTitle}>ابدأ بسرعة</Text>
      <View style={styles.actions}>
        <Action title="جلسة تركيز 45 دقيقة" detail="وبعدها استراحة 15 دقيقة" onPress={() => router.push("/(tabs)/focus")} />
        <Action title="فيديو مذاكرة" detail="سجّل وقتك وملاحظاتك" onPress={() => router.push("/video")} />
        <Action title="كلم سيفي" detail="مساعدك بالمصري" onPress={() => router.push("/assistant")} />
      </View>
    </ScrollView>
  </ScreenContainer>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Action({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) { return <View style={styles.action}><Text onPress={onPress} style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text></View>; }

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" }, content: { padding: 20, paddingBottom: 34 }, eyebrow: { color: colors.primary, fontWeight: "800", textAlign: "right" }, title: { color: colors.foreground, fontSize: 29, fontWeight: "900", textAlign: "right", marginTop: 5 }, subtitle: { color: colors.muted, textAlign: "right", marginTop: 5, marginBottom: 20 }, coinCard: { backgroundColor: colors.primary, borderRadius: 22, padding: 20, marginBottom: 14 }, coinLabel: { color: "#d5fff6", textAlign: "right" }, coins: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 5 }, coinHint: { color: "#d5fff6", textAlign: "right", marginTop: 5 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { width: "48%", flexGrow: 1, minWidth: 145, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 }, metricValue: { color: colors.primary, fontSize: 23, fontWeight: "900", textAlign: "right" }, metricLabel: { color: colors.muted, textAlign: "right", marginTop: 5 }, sectionTitle: { color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: "right", marginTop: 25, marginBottom: 10 }, actions: { gap: 10 }, action: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 17 }, actionTitle: { color: colors.foreground, fontWeight: "800", fontSize: 16, textAlign: "right" }, actionDetail: { color: colors.muted, textAlign: "right", marginTop: 5 },
});
