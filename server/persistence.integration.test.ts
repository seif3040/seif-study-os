import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { achievements, coinTransactions, examAttempts, goalMilestones, goals, habitCompletions, lessonProgress, lessons, notes, pomodoroSessions, rewardPurchases, rewards, studyCycles, studyEvents, studyVideoSessions, videoNotes, subjects, tasks, userAchievements, users, chapters, exams, notebooks } from "../drizzle/schema";
import { completeExamAttempt, completeLesson, completeTask, createChapter, createExam, createLesson, createSubject, createTask, createVideoNote, endVideoSession, getActiveCycle, getDb, listAchievements, listExams, listStudyPlan, listTasks, listVideoSessions, purchaseReward, startVideoSession, updateVideoNote, deleteVideoNote } from "./db";

const enabled = Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
let userId = 0; let rewardId = 0; let cycleId = 0; const openId = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;

suite("database-backed Seif Study OS business flows", () => {
  beforeAll(async () => {
    const db = await getDb(); if (!db) throw new Error("Integration database unavailable");
    await db.insert(users).values({ openId, name: "Integration Test", role: "user", lastSignedIn: new Date() });
    const created = await db.select().from(users).where(eq(users.openId, openId)).limit(1); userId = created[0]!.id;
    const cycle = await getActiveCycle(userId); cycleId = cycle.id;
    await db.insert(coinTransactions).values({ userId, cycleId, amount: 100, type: "earn", reason: "integration seed", referenceKey: `integration-credit-${openId}` });
    await db.insert(rewards).values({ catalogId: 900000 + userId, title: "Integration Reward", rarity: "common", cost: 25, active: true });
    const createdReward = await db.select().from(rewards).where(eq(rewards.catalogId, 900000 + userId)).limit(1); rewardId = createdReward[0]!.id;
  });

  afterAll(async () => {
    const db = await getDb(); if (!db || !userId) return;
    await db.delete(rewards).where(eq(rewards.id, rewardId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("prevents duplicate purchases and duplicate task-completion awards through real persistence", async () => {
    expect((await listTasks(userId)).filter(item => item.title === "Integration task")).toHaveLength(0);
    await expect(completeTask(userId, 999999999)).rejects.toThrow("المهمة غير موجودة");
    const referenceKey = crypto.randomUUID();
    const firstPurchase = await purchaseReward(userId, rewardId, referenceKey);
    const secondPurchase = await purchaseReward(userId, rewardId, referenceKey);
    expect(firstPurchase.purchased).toBe(true);
    expect(secondPurchase).toMatchObject({ purchased: false, reason: "already_purchased" });

    await createTask(userId, { title: "Integration task", priority: "medium" });
    const task = (await listTasks(userId)).find(item => item.title === "Integration task");
    expect(task).toBeTruthy();
    const firstCompletion = await completeTask(userId, task!.id);
    const duplicateCompletion = await completeTask(userId, task!.id);
    expect(firstCompletion.awarded).toBe(true);
    expect(duplicateCompletion).toMatchObject({ alreadyCompleted: true, awarded: false });
  }, 30_000);

  it("persists watched-video history and per-video note CRUD through real persistence", async () => {
    const video = await startVideoSession(userId, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(video).toBeTruthy();
    await createVideoNote(userId, { sessionId: video!.id, title: "First insight", content: "مفهوم مهم من المحاضرة", timestampSeconds: 42 });
    const history = await listVideoSessions(userId);
    const stored = history.find(item => item.id === video!.id);
    expect(stored?.notes).toHaveLength(1);
    expect(stored?.notes[0]).toMatchObject({ title: "First insight", timestampSeconds: 42 });
    const noteId = stored!.notes[0]!.id;
    await updateVideoNote(userId, noteId, { title: "Updated insight", content: "تم تحديث الملاحظة", timestampSeconds: 55 });
    const updated = (await listVideoSessions(userId)).find(item => item.id === video!.id);
    expect(updated?.notes[0]).toMatchObject({ title: "Updated insight", content: "تم تحديث الملاحظة", timestampSeconds: 55 });
    await deleteVideoNote(userId, noteId);
    expect((await listVideoSessions(userId)).find(item => item.id === video!.id)?.notes).toHaveLength(0);
    await endVideoSession(userId, video!.id);
    expect((await listVideoSessions(userId)).find(item => item.id === video!.id)?.phase).toBe("completed");
  }, 30_000);

  it("persists achievement unlocks and a bounded exam-comprehension result through real business functions", async () => {
    expect((await listStudyPlan(userId)).rows.filter(row => row.subject.title === "Integration subject")).toHaveLength(0);
    await createSubject(userId, { title: "Integration subject" });
    const plan = await listStudyPlan(userId); const subject = plan.rows.find(row => row.subject.title === "Integration subject")!.subject;
    await createChapter(userId, { subjectId: subject.id, title: "Integration chapter" });
    const updatedPlan = await listStudyPlan(userId); const chapter = updatedPlan.rows.find(row => row.chapter?.title === "Integration chapter")!.chapter!;
    await createLesson(userId, { chapterId: chapter.id, title: "Integration lesson", estimatedMinutes: 10 });
    const lessonPlan = await listStudyPlan(userId); const lesson = lessonPlan.rows.find(row => row.lesson?.title === "Integration lesson")!.lesson!;
    await completeLesson(userId, lesson.id);
    const achievementState = await listAchievements(userId);
    expect(achievementState.unlocked).toBeGreaterThan(0);

    await createExam(userId, { title: "Integration exam" });
    const exam = (await listExams(userId)).find(item => item.exam.title === "Integration exam")!.exam;
    const attempt = await completeExamAttempt(userId, { examId: exam.id, totalQuestions: 10, correctAnswers: 8, difficulty: "medium", missedTopics: ["topic"] });
    expect(attempt.comprehensionScore).toBeGreaterThanOrEqual(0);
    expect(attempt.comprehensionScore).toBeLessThanOrEqual(100);
  }, 30_000);
});
