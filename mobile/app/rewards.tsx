import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { trpc } from "@/lib/trpc";

export default function RewardsScreen() {
  const utils = trpc.useUtils();
  const rewards = trpc.rewards.list.useQuery();
  const buy = trpc.rewards.purchase.useMutation({ onSuccess: async () => { await utils.rewards.list.invalidate(); await utils.coins.ledger.invalidate(); } });
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع</Text></Pressable><Text style={styles.title}>متجر المكافآت</Text><Text style={styles.subtitle}>رصيدك الحالي: <Text style={styles.coin}>{rewards.data?.coins.balance ?? 0} Coins</Text></Text>{(rewards.data?.items ?? []).map(item => { const disabled = (rewards.data?.coins.balance ?? 0) < item.cost; return <View key={item.id} style={styles.row}><View style={styles.body}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.muted}>{item.rarity} · {item.cost} Coins</Text></View><Pressable disabled={disabled || buy.isPending} onPress={() => buy.mutate({ rewardId: item.id, referenceKey: crypto.randomUUID() })} style={[styles.small, disabled && styles.disabled]}><Text style={styles.smallText}>{disabled ? "اجمع أكتر" : "اشترِ"}</Text></Pressable></View>; })}</ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 50 }, back: { color: colors.primary, fontWeight: "800", textAlign: "right", fontSize: 16 }, title: { color: colors.foreground, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 16 }, subtitle: { color: colors.muted, textAlign: "right", marginTop: 6, marginBottom: 18 }, coin: { color: colors.primary, fontWeight: "900" }, row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 9 }, body: { flex: 1 }, rowTitle: { color: colors.foreground, textAlign: "right", fontWeight: "900" }, muted: { color: colors.muted, textAlign: "right", marginTop: 5, lineHeight: 20, fontSize: 12 }, small: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }, smallText: { color: colors.primary, fontWeight: "900", fontSize: 12 }, disabled: { opacity: 0.45 },
});
