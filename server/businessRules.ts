import type { AchievementMetric } from "../shared/catalog";

export type PurchaseDecision = "duplicate" | "insufficient_balance" | "approved";

export function decideRewardPurchase(input: { hasPriorReference: boolean; balance: number; cost: number }): PurchaseDecision {
  if (input.hasPriorReference) return "duplicate";
  if (!Number.isFinite(input.balance) || !Number.isFinite(input.cost) || input.cost < 0 || input.balance < input.cost) return "insufficient_balance";
  return "approved";
}

export function decideCompletion(status: string) {
  return status === "completed" ? "duplicate" as const : "award" as const;
}

export function selectAchievementUnlocks<T extends { id: number; metric: AchievementMetric; target: number }>(catalog: T[], unlockedIds: Set<number>, metrics: Partial<Record<AchievementMetric, number>>) {
  return catalog.filter(item => !unlockedIds.has(item.id) && (metrics[item.metric] ?? 0) >= item.target);
}

export function deriveFallbackComprehension(score: number, difficulty: "easy" | "medium" | "hard", priorAverage: number) {
  const adjustment = difficulty === "hard" ? 4 : difficulty === "easy" ? -3 : 0;
  return Math.round(Math.max(0, Math.min(100, score * 0.75 + priorAverage * 0.15 + 10 + adjustment)));
}
