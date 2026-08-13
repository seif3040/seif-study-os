import { describe, expect, it } from "vitest";
import { decideCompletion, decideRewardPurchase, deriveFallbackComprehension, selectAchievementUnlocks } from "./businessRules";

describe("non-mocked Seif Study OS business flows", () => {
  it("handles reward purchase idempotency and balance protection", () => {
    expect(decideRewardPurchase({ hasPriorReference: true, balance: 100, cost: 20 })).toBe("duplicate");
    expect(decideRewardPurchase({ hasPriorReference: false, balance: 10, cost: 20 })).toBe("insufficient_balance");
    expect(decideRewardPurchase({ hasPriorReference: false, balance: 20, cost: 20 })).toBe("approved");
  });
  it("prevents duplicate completion awards", () => {
    expect(decideCompletion("open")).toBe("award");
    expect(decideCompletion("completed")).toBe("duplicate");
  });
  it("unlocks only eligible achievements that were not previously unlocked", () => {
    const catalog = [{ id: 1, metric: "lessonsCompleted" as const, target: 3 }, { id: 2, metric: "pomodoros" as const, target: 2 }];
    expect(selectAchievementUnlocks(catalog, new Set([1]), { lessonsCompleted: 5, pomodoros: 2 }).map(x => x.id)).toEqual([2]);
  });
  it("derives bounded comprehension when the live model is unavailable", () => {
    expect(deriveFallbackComprehension(120, "hard", 90)).toBe(100);
    expect(deriveFallbackComprehension(70, "hard", 60)).toBeGreaterThan(deriveFallbackComprehension(70, "easy", 60));
  });
});
