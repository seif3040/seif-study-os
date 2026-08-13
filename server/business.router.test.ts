import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  completeTask: vi.fn(),
  purchaseReward: vi.fn(),
  listAchievements: vi.fn(),
  completeExamAttempt: vi.fn(),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  completeTask: mocks.completeTask,
  purchaseReward: mocks.purchaseReward,
  listAchievements: mocks.listAchievements,
  completeExamAttempt: mocks.completeExamAttempt,
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 42, openId: "study-user", name: "Study User", email: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("protected study business routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves duplicate-completion results from the server business workflow", async () => {
    mocks.completeTask.mockResolvedValue({ alreadyCompleted: true, awarded: false, unlocks: [] });
    const result = await appRouter.createCaller(context()).tasks.complete({ taskId: 7 });
    expect(mocks.completeTask).toHaveBeenCalledWith(42, 7);
    expect(result).toEqual({ alreadyCompleted: true, awarded: false, unlocks: [] });
  });

  it("preserves idempotent reward-purchase outcomes and reference keys", async () => {
    const referenceKey = "7f778c45-1b30-4df1-9498-0a43bd26c2d2";
    mocks.purchaseReward.mockResolvedValue({ purchased: false, reason: "already_purchased", balance: 50 });
    const result = await appRouter.createCaller(context()).rewards.purchase({ rewardId: 9, referenceKey });
    expect(mocks.purchaseReward).toHaveBeenCalledWith(42, 9, referenceKey);
    expect(result).toMatchObject({ purchased: false, reason: "already_purchased", balance: 50 });
  });

  it("returns server-calculated achievement states without accepting client unlock input", async () => {
    mocks.listAchievements.mockResolvedValue({ unlocked: 1, items: [{ id: 3, title: "بداية الرحلة", current: 1, target: 1, percent: 100 }] });
    const result = await appRouter.createCaller(context()).achievements.list();
    expect(mocks.listAchievements).toHaveBeenCalledWith(42);
    expect(result.items[0]).toMatchObject({ title: "بداية الرحلة", percent: 100 });
  });

  it("returns a server-generated comprehension result for exam attempts", async () => {
    mocks.completeExamAttempt.mockResolvedValue({ score: 80, comprehensionScore: 85, completion: { awarded: true }, bonusAmount: 35, unlocks: [] });
    const result = await appRouter.createCaller(context()).exams.completeAttempt({ examId: 4, totalQuestions: 20, correctAnswers: 16, difficulty: "medium", missedTopics: ["المعادلات"] });
    expect(mocks.completeExamAttempt).toHaveBeenCalledWith(42, expect.objectContaining({ examId: 4, correctAnswers: 16 }));
    expect(result).toMatchObject({ score: 80, comprehensionScore: 85, bonusAmount: 35 });
  });
});
