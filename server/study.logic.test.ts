import { describe, expect, it } from "vitest";
import { achievementCatalog, rewardCatalog } from "../shared/catalog";
import { canSpendCoins, coinRewardForPomodoro, examBonusForComprehension, fallbackComprehension, isAchievementEligible, isFirstCompletion, taskRewardForPriority, validatedVideoIncrement } from "./db";

describe("Seif Study OS reward rules", () => {
  it("keeps the Pomodoro reward table exact and rewards only supported full sessions", () => {
    expect(coinRewardForPomodoro(15)).toBe(8);
    expect(coinRewardForPomodoro(25)).toBe(12);
    expect(coinRewardForPomodoro(45)).toBe(22);
    expect(coinRewardForPomodoro(60)).toBe(30);
    expect(coinRewardForPomodoro(30)).toBe(0);
  });

  it("uses the stated priority rewards for tasks", () => {
    expect(taskRewardForPriority("urgent")).toBe(30);
    expect(taskRewardForPriority("medium")).toBe(20);
    expect(taskRewardForPriority("low")).toBe(10);
  });

  it("applies comprehension bonus thresholds without rewarding lower scores", () => {
    expect(examBonusForComprehension(59)).toBe(0);
    expect(examBonusForComprehension(60)).toBe(10);
    expect(examBonusForComprehension(70)).toBe(20);
    expect(examBonusForComprehension(80)).toBe(35);
    expect(examBonusForComprehension(90)).toBe(50);
    expect(examBonusForComprehension(95)).toBe(75);
  });

  it("prevents a purchase from creating a negative coin balance", () => {
    expect(canSpendCoins(30, 25)).toBe(true);
    expect(canSpendCoins(24, 25)).toBe(false);
    expect(canSpendCoins(30, -1)).toBe(false);
  });

  it("allows an award only for a first completion state", () => {
    expect(isFirstCompletion("open")).toBe(true);
    expect(isFirstCompletion("completed")).toBe(false);
  });

  it("accepts only media-position changes plausible for the server elapsed window", () => {
    expect(validatedVideoIncrement(10, 25, 15)).toBe(15);
    expect(validatedVideoIncrement(10, 90, 10)).toBe(0);
    expect(validatedVideoIncrement(50, 20, 10)).toBe(0);
  });

  it("unlocks an achievement only once its measured target is reached", () => {
    expect(isAchievementEligible(9, 10)).toBe(false);
    expect(isAchievementEligible(10, 10)).toBe(true);
    expect(isAchievementEligible(11, 10)).toBe(true);
  });

  it("keeps fallback comprehension bounded and sensitive to difficulty", () => {
    expect(fallbackComprehension(0, "easy", 0)).toBeGreaterThanOrEqual(0);
    expect(fallbackComprehension(100, "hard", 100)).toBeLessThanOrEqual(100);
    expect(fallbackComprehension(70, "hard", 60)).toBeGreaterThan(fallbackComprehension(70, "easy", 60));
  });
});

describe("Seif Study OS catalogs", () => {
  it("contains exactly 100 immutable rewards across the requested rarity allocation", () => {
    expect(rewardCatalog).toHaveLength(100);
    expect(new Set(rewardCatalog.map(item => item.catalogId)).size).toBe(100);
    expect(rewardCatalog.filter(item => item.rarity === "common")).toHaveLength(15);
    expect(rewardCatalog.filter(item => item.rarity === "uncommon")).toHaveLength(20);
    expect(rewardCatalog.filter(item => item.rarity === "rare")).toHaveLength(20);
    expect(rewardCatalog.filter(item => item.rarity === "epic")).toHaveLength(20);
    expect(rewardCatalog.filter(item => item.rarity === "legendary")).toHaveLength(15);
    expect(rewardCatalog.filter(item => item.rarity === "mythic")).toHaveLength(10);
  });

  it("contains exactly 100 achievement definitions with unique catalog IDs", () => {
    expect(achievementCatalog).toHaveLength(100);
    expect(new Set(achievementCatalog.map(item => item.catalogId)).size).toBe(100);
    expect(achievementCatalog.every(item => item.target > 0 && item.title.length > 0)).toBe(true);
  });
});
