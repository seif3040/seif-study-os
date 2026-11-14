import { emptyPlanner, overlapsPlannerSlot, plannerPolicy, plannerToday, plannerWeekday, shiftPlannerDay, type PlannerSlot, type PlannerState } from "../shared/studyPlanner.js";
import { studyPlanner } from "../drizzle/schema.js";
import { coinRateCatalog, coinRateKeys, type CoinRateKey } from "../shared/coinRates.js";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  achievements, calendarEvents, chapters, coinTransactions, examAttempts, examLessons, exams, goalMilestones,
  offlineExamWrites, offlineTaskWrites, coinRateSettings, assistantChats, assistantMessages, dailyStudySummaries, goals, habitCompletions, habits, lessonProgress, lessons, flashcardDecks, flashcards, notebooks, notebookSources, notes, pomodoroSessions,
  rewardPurchases, rewards, studyCycles, studyEvents, studyVideoSessions, videoNotes, subjects, tasks, lessonSources,
  userAchievements, users, type InsertUser,
} from "../drizzle/schema.js";
import { seifLessonSourceDefaults, type LessonSourceDraft } from "../shared/lessonSources.js";
import { achievementCatalog, rewardCatalog, type AchievementMetric } from "../shared/catalog.js";
import { invokeLLM } from "./_core/llm.js";
import { storageGetSignedUrl, storagePut } from "./storage.js";
import { ENV } from "./_core/env.js";
import { decideCompletion, decideRewardPurchase, deriveFallbackComprehension, selectAchievementUnlocks } from "./businessRules.js";
import { classifyStudySource } from "../client/src/lib/videoSources.js";

let _db: ReturnType<typeof drizzle> | null = null;
const DAY_MS = 86_400_000;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة حاليًا.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await database();
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? new Date(),
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
  };
  await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: new Date(), role: values.role },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function dateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function coinRewardForPomodoro(minutes: number) {
  return ({ 15: 8, 25: 12, 45: 22, 60: coinRateCatalog.pomodoro_60[1] } as Record<number, number>)[minutes] ?? 0;
}

export function taskRewardForPriority(priority: "urgent" | "medium" | "low") {
  return ({ urgent: 30, medium: 20, low: 10 } as const)[priority];
}

export function examBonusForComprehension(score: number) {
  if (score >= 95) return 75;
  if (score >= 90) return 50;
  if (score >= 80) return 35;
  if (score >= 70) return 20;
  if (score >= 60) return 10;
  return 0;
}

export function canSpendCoins(balance: number, cost: number) {
  return decideRewardPurchase({ hasPriorReference: false, balance, cost }) === "approved";
}

export function isFirstCompletion(status: string) {
  return decideCompletion(status) === "award";
}

export function validatedVideoIncrement(previousPosition: number, nextPosition: number, elapsedOnServer: number) {
  const delta = nextPosition - previousPosition;
  return delta >= 0 && delta <= Math.min(70, Math.max(0, elapsedOnServer) + 4) ? delta : 0;
}

export function isAchievementEligible(current: number, target: number) {
  return selectAchievementUnlocks([{ id: 1, metric: "lessonsCompleted" as AchievementMetric, target }], new Set(), { lessonsCompleted: current }).length === 1;
}

async function seedCatalogs(db: any) {
  const [rewardCount] = await db.select({ value: count() }).from(rewards);
  if (Number(rewardCount?.value ?? 0) === 0) await db.insert(rewards).values(rewardCatalog);
  const [achievementCount] = await db.select({ value: count() }).from(achievements);
  if (Number(achievementCount?.value ?? 0) === 0) await db.insert(achievements).values(achievementCatalog);
}

// Older database rows still require a cycleId. Reuse an existing row as a
// storage reference without expiring it or using it to filter study history.
export async function getActiveCycle(userId: number) {
  const db = await database();
  await seedCatalogs(db);
  const existing = await db.select().from(studyCycles)
    .where(eq(studyCycles.userId, userId)).orderBy(desc(studyCycles.id)).limit(1);
  if (existing[0]) return existing[0];

  const startAt = new Date();
  const cycleKey = "permanent";
  await db.insert(studyCycles).values({ userId, cycleKey, startAt, endAt: startAt, status: "active" })
    .onDuplicateKeyUpdate({ set: { cycleKey } });
  const [created] = await db.select().from(studyCycles)
    .where(and(eq(studyCycles.userId, userId), eq(studyCycles.cycleKey, cycleKey))).limit(1);
  if (!created) throw new Error("تعذر تجهيز مساحة المذاكرة.");
  return created;
}

async function getCoinSummary(db: any, userId: number) {
  const [row] = await db.select({
    balance: sql<number>`coalesce(sum(${coinTransactions.amount}), 0)`,
    earned: sql<number>`coalesce(sum(case when ${coinTransactions.amount} > 0 then ${coinTransactions.amount} else 0 end), 0)`,
    spent: sql<number>`coalesce(sum(case when ${coinTransactions.amount} < 0 then -${coinTransactions.amount} else 0 end), 0)`,
  }).from(coinTransactions).where(eq(coinTransactions.userId, userId));
  return { balance: Number(row?.balance ?? 0), earned: Number(row?.earned ?? 0), spent: Number(row?.spent ?? 0) };
}

export async function listCoinRates() {
  const db = await database();
  const saved = await db.select().from(coinRateSettings);
  const overrides = new Map(saved.map(item => [item.rateKey, item.amount]));
  return coinRateKeys.map(key => {
    const [label, amount, group] = coinRateCatalog[key];
    return { key, label, group, amount: overrides.get(key) ?? amount };
  });
}

export async function setCoinRate(key: CoinRateKey, amount: number) {
  const db = await database();
  await db.insert(coinRateSettings).values({ rateKey: key, amount }).onDuplicateKeyUpdate({ set: { amount } });
  return { success: true };
}

export async function setRewardPrice(rewardId: number, cost: number) {
  const db = await database();
  const [result] = await db.update(rewards).set({ cost }).where(eq(rewards.id, rewardId));
  if (!result.affectedRows) throw new Error("الهدية مش موجودة.");
  return { success: true };
}

async function awardCoins(params: { userId: number; cycleId: number; amount: number; reason: string; referenceKey: string; rateKey?: CoinRateKey }) {
  const db = await database();
  const { rateKey, ...entry } = params;
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, entry.userId)).for("update");
    const [already] = await tx.select({ id: coinTransactions.id }).from(coinTransactions).where(eq(coinTransactions.referenceKey, entry.referenceKey)).limit(1);
    if (already) return { awarded: false, amount: 0, balance: (await getCoinSummary(tx, entry.userId)).balance };
    const [rate] = rateKey ? await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
      .where(eq(coinRateSettings.rateKey, rateKey)).limit(1) : [];
    const amount = rate?.amount ?? entry.amount;
    if (amount <= 0) return { awarded: false, amount: 0, balance: (await getCoinSummary(tx, entry.userId)).balance };
    await tx.insert(coinTransactions).values({ ...entry, amount, type: "earn" });
    return { awarded: true, amount, balance: (await getCoinSummary(tx, entry.userId)).balance };
  });
}

async function recordStudyEvent(params: { userId: number; cycleId: number; subjectId?: number | null; eventType: typeof studyEvents.$inferInsert.eventType; referenceId: string; durationMinutes?: number }) {
  const db = await database();
  const exists = await db.select({ id: studyEvents.id }).from(studyEvents).where(and(eq(studyEvents.userId, params.userId), eq(studyEvents.referenceId, params.referenceId))).limit(1);
  if (exists[0]) return false;
  await db.insert(studyEvents).values({ ...params, durationMinutes: params.durationMinutes ?? 0 });
  return true;
}

async function metricSnapshot(db: any, userId: number) {
  const [events] = await db.select({
    lessonsCompleted: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'lesson_complete' then 1 else 0 end), 0)`,
    reviews: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'lesson_review' then 1 else 0 end), 0)`,
    studyMinutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)`,
    pomodoros: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'pomodoro_complete' then 1 else 0 end), 0)`,
    tasksCompleted: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'task_complete' then 1 else 0 end), 0)`,
    urgentTasks: sql<number>`0`,
    goalsCompleted: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'goal_complete' then 1 else 0 end), 0)`,
    habitDays: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'habit_complete' then 1 else 0 end), 0)`,
    videoMinutes: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'video_block' then ${studyEvents.durationMinutes} else 0 end), 0)`,
    videoBlocks: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'video_block' then 1 else 0 end), 0)`,
    examsCompleted: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'exam_complete' then 1 else 0 end), 0)`,
    activeDays: sql<number>`count(distinct date(${studyEvents.occurredAt}))`,
  }).from(studyEvents).where(eq(studyEvents.userId, userId));
  const [urgent] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), eq(tasks.priority, "urgent")));
  const [examSummary] = await db.select({
    best: sql<number>`coalesce(max(${examAttempts.score}), 0)`,
    average: sql<number>`coalesce(avg(${examAttempts.score}), 0)`,
  }).from(examAttempts).where(eq(examAttempts.userId, userId));
  const coins = await getCoinSummary(db, userId);
  const eventDay = sql<string>`date(\`studyEvents\`.\`occurredAt\`)`;
  const activityRows = await db.select({ day: eventDay }).from(studyEvents)
    .where(eq(studyEvents.userId, userId)).groupBy(eventDay).orderBy(desc(eventDay));
  let streak = 0;
  let cursor = new Date(`${dateKey()}T00:00:00.000Z`).getTime();
  for (const row of activityRows) {
    const day = new Date(`${row.day}T00:00:00.000Z`).getTime();
    if (day === cursor) { streak += 1; cursor -= DAY_MS; }
    else if (streak === 0 && day === cursor - DAY_MS) { streak += 1; cursor = day - DAY_MS; }
    else break;
  }
  const values = {
    lessonsCompleted: Number(events?.lessonsCompleted ?? 0), reviews: Number(events?.reviews ?? 0), studyMinutes: Number(events?.studyMinutes ?? 0),
    pomodoros: Number(events?.pomodoros ?? 0), tasksCompleted: Number(events?.tasksCompleted ?? 0), urgentTasks: Number(urgent?.value ?? 0),
    goalsCompleted: Number(events?.goalsCompleted ?? 0), habitDays: Number(events?.habitDays ?? 0), videoMinutes: Number(events?.videoMinutes ?? 0),
    videoBlocks: Number(events?.videoBlocks ?? 0), examsCompleted: Number(events?.examsCompleted ?? 0), bestExamScore: Number(examSummary?.best ?? 0),
    averageExamScore: Number(examSummary?.average ?? 0), coinsEarned: coins.earned, activeDays: Number(events?.activeDays ?? 0), currentStreak: streak,
  };
  return { ...values, compositeScholar: Math.min(values.lessonsCompleted, Math.floor(values.studyMinutes / 30)), compositeProductivity: Math.min(values.tasksCompleted, values.pomodoros * 2), compositeAcademic: Math.min(values.examsCompleted, Math.floor(values.averageExamScore / 8.5)), cycleComplete: values.activeDays };
}

export async function evaluateAchievements(userId: number, cycleId: number) {
  const db = await database();
  const metrics = await metricSnapshot(db, userId) as Record<AchievementMetric, number>;
  const streakRewards: Record<number, number> = { 3: 25, 7: 75, 14: 150, 30: 400, 60: 800, 90: 1500 };
  const milestone = Object.keys(streakRewards).map(Number).filter(days => metrics.currentStreak >= days).sort((a, b) => b - a)[0];
  if (milestone) {
    const reason = `مكافأة سلسلة ${milestone} يوم`;
    const [previous] = await db.select({ id: coinTransactions.id }).from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, reason))).limit(1);
    if (!previous) await awardCoins({ userId, cycleId, amount: streakRewards[milestone], rateKey: ("streak_" + milestone) as CoinRateKey, reason, referenceKey: `streak:lifetime:${userId}:${milestone}` });
  }
  const catalog = await db.select().from(achievements);
  const unlocked = await db.select({ achievementId: userAchievements.achievementId }).from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const unlockedIds = new Set(unlocked.map((row: any) => row.achievementId));
  const newUnlocks = selectAchievementUnlocks(catalog as any[], unlockedIds, metrics);
  if (newUnlocks.length) await db.insert(userAchievements).values(newUnlocks.map((item: any) => ({ userId, cycleId, achievementId: item.id })));
  return newUnlocks.map((item: any) => ({ id: item.id, title: item.title, rarity: item.rarity }));
}

async function ownedLesson(db: any, userId: number, lessonId: number) {
  const rows = await db.select({ lessonId: lessons.id, subjectId: subjects.id, cycleId: subjects.cycleId, title: lessons.title })
    .from(lessons).innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(and(eq(lessons.id, lessonId), eq(subjects.userId, userId), isNull(lessons.deletedAt))).limit(1);
  if (!rows[0]) throw new Error("الدرس غير موجود.");
  return rows[0];
}

export async function dashboard(userId: number) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  const metrics = await metricSnapshot(db, userId);
  const coins = await getCoinSummary(db, userId);
  const today = dateKey();
  const todaysTasks = await db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.scheduledFor, today))).orderBy(desc(tasks.priority));
  const upcomingExams = await db.select({ id: exams.id, title: exams.title, scheduledAt: exams.scheduledAt, subject: subjects.title }).from(exams)
    .leftJoin(subjects, eq(exams.subjectId, subjects.id)).where(and(eq(exams.userId, userId), isNull(exams.archivedAt), gte(exams.scheduledAt, new Date()))).orderBy(exams.scheduledAt).limit(4);
  const activeGoals = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.status, "active"))).orderBy(desc(goals.progress)).limit(4);
  const [latestPomodoro] = await db.select().from(pomodoroSessions).where(eq(pomodoroSessions.userId, userId)).orderBy(desc(pomodoroSessions.createdAt), desc(pomodoroSessions.id)).limit(1);
  const ongoingPomodoro = latestPomodoro && (latestPomodoro.state === "running" || latestPomodoro.state === "paused") ? latestPomodoro : null;
  return { cycle, metrics, coins, todaysTasks, upcomingExams, activeGoals, ongoingPomodoro };
}

export async function listStudyPlan(userId: number) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  const rows = await db.select({ subject: subjects, chapter: chapters, lesson: lessons, progress: lessonProgress })
    .from(subjects).leftJoin(chapters, eq(chapters.subjectId, subjects.id)).leftJoin(lessons, and(eq(lessons.chapterId, chapters.id), isNull(lessons.deletedAt)))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)))
    .where(eq(subjects.userId, userId)).orderBy(subjects.createdAt, chapters.sortOrder, lessons.sortOrder);
  return { cycle, rows };
}

export async function createSubject(userId: number, input: { title: string; color?: string }) {
  const db = await database(); const cycle = await getActiveCycle(userId);
  await db.insert(subjects).values({ userId, cycleId: cycle.id, title: input.title, color: input.color ?? "#10B981" });
}
export async function updateSubject(userId: number, subjectId: number, input: { title: string; color?: string }) { const db = await database(); return db.update(subjects).set({ title: input.title, ...(input.color ? { color: input.color } : {}) }).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId))); }
export async function deleteSubject(userId: number, subjectId: number) { const db = await database(); return db.delete(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId))); }
export async function createChapter(userId: number, input: { subjectId: number; title: string }) {
  const db = await database();
  const valid = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.id, input.subjectId), eq(subjects.userId, userId))).limit(1);
  if (!valid[0]) throw new Error("المادة غير موجودة.");
  const [last] = await db.select({ order: sql<number>`coalesce(max(${chapters.sortOrder}), 0)` }).from(chapters).where(eq(chapters.subjectId, input.subjectId));
  await db.insert(chapters).values({ subjectId: input.subjectId, title: input.title, sortOrder: Number(last?.order ?? 0) + 1 });
}
export async function updateChapter(userId: number, chapterId: number, title: string) { const db = await database(); const valid = await db.select({ id: chapters.id }).from(chapters).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(eq(chapters.id, chapterId), eq(subjects.userId, userId))).limit(1); if (!valid[0]) throw new Error("الفصل غير موجود."); return db.update(chapters).set({ title }).where(eq(chapters.id, chapterId)); }
export async function deleteChapter(userId: number, chapterId: number) { const db = await database(); const valid = await db.select({ id: chapters.id }).from(chapters).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(eq(chapters.id, chapterId), eq(subjects.userId, userId))).limit(1); if (!valid[0]) throw new Error("الفصل غير موجود."); return db.delete(chapters).where(eq(chapters.id, chapterId)); }
export async function createLesson(userId: number, input: { chapterId: number; title: string; description?: string; estimatedMinutes: number; notes?: string }) {
  const db = await database();
  const ownership = await db.select({ id: chapters.id }).from(chapters).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(eq(chapters.id, input.chapterId), eq(subjects.userId, userId))).limit(1);
  if (!ownership[0]) throw new Error("الفصل غير موجود.");
  const [last] = await db.select({ order: sql<number>`coalesce(max(${lessons.sortOrder}), 0)` }).from(lessons).where(eq(lessons.chapterId, input.chapterId));
  await db.insert(lessons).values({ ...input, description: input.description ?? null, notes: input.notes ?? null, sortOrder: Number(last?.order ?? 0) + 1 });
}
export async function updateLesson(userId: number, lessonId: number, input: { title: string; description?: string; estimatedMinutes: number; notes?: string }) { const db = await database(); await ownedLesson(db, userId, lessonId); return db.update(lessons).set({ title: input.title, description: input.description ?? null, estimatedMinutes: input.estimatedMinutes, notes: input.notes ?? null }).where(eq(lessons.id, lessonId)); }
export async function deleteLesson(userId: number, lessonId: number) { const db = await database(); await ownedLesson(db, userId, lessonId); return db.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, lessonId)); }
export async function updateLessonProgress(userId: number, lessonId: number, progress: number) {
  const db = await database(); await ownedLesson(db, userId, lessonId);
  const value = Math.min(99, Math.max(0, progress));
  const prior = await db.select().from(lessonProgress).where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId))).limit(1);
  if (prior[0]) await db.update(lessonProgress).set({ status: value ? "in_progress" : "not_started", progress: value }).where(eq(lessonProgress.id, prior[0].id));
  else await db.insert(lessonProgress).values({ userId, lessonId, status: value ? "in_progress" : "not_started", progress: value });
}
export async function completeLesson(userId: number, lessonId: number, completedAt = new Date()) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const lesson = await ownedLesson(tx, userId, lessonId);
    const [prior] = await tx.select().from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId))).for("update");
    if (prior?.status === "completed") return { alreadyCompleted: true, awarded: false, amount: 0, cycleId: lesson.cycleId };

    const reference = "lesson:" + lessonId + ":complete";
    if (prior) await tx.update(lessonProgress).set({ status: "completed", progress: 100, completedAt }).where(eq(lessonProgress.id, prior.id));
    else await tx.insert(lessonProgress).values({ userId, lessonId, status: "completed", progress: 100, completedAt });
    const [event] = await tx.select({ id: studyEvents.id }).from(studyEvents)
      .where(and(eq(studyEvents.userId, userId), eq(studyEvents.referenceId, reference))).limit(1);
    if (!event) await tx.insert(studyEvents).values({
      userId, cycleId: lesson.cycleId, subjectId: lesson.subjectId, eventType: "lesson_complete", referenceId: reference, occurredAt: completedAt,
    });
    const [priorReward] = await tx.select({ id: coinTransactions.id }).from(coinTransactions)
      .where(eq(coinTransactions.referenceKey, reference)).limit(1);
    const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
      .where(eq(coinRateSettings.rateKey, "lesson_complete")).limit(1);
    const amount = priorReward ? 0 : rate?.amount ?? 75;
    if (amount > 0) await tx.insert(coinTransactions).values({
      userId, cycleId: lesson.cycleId, amount, type: "earn", referenceKey: reference,
      reason: "إكمال درس: " + lesson.title, createdAt: completedAt,
    });
    return { alreadyCompleted: false, awarded: amount > 0, amount, cycleId: lesson.cycleId, balance: (await getCoinSummary(tx, userId)).balance };
  });
  const { cycleId, ...completion } = result;
  const unlocks = result.alreadyCompleted ? [] : await evaluateAchievements(userId, cycleId).catch(() => []);
  return { ...completion, unlocks };
}

export async function reviewLesson(userId: number, lessonId: number) {
  const db = await database(); const lesson = await ownedLesson(db, userId, lessonId);
  const prior = await db.select().from(lessonProgress).where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId))).limit(1);
  if (prior[0]?.status !== "completed") throw new Error("أكمل الدرس أولًا قبل مراجعته.");
  const ref = `lesson:${lessonId}:review:${dateKey()}`;
  await db.update(lessonProgress).set({ lastReviewedAt: new Date() }).where(eq(lessonProgress.id, prior[0].id));
  await recordStudyEvent({ userId, cycleId: lesson.cycleId, subjectId: lesson.subjectId, eventType: "lesson_review", referenceId: ref });
  const reward = await awardCoins({ userId, cycleId: lesson.cycleId, amount: 15, rateKey: "lesson_review", reason: `مراجعة درس: ${lesson.title}`, referenceKey: ref });
  return { ...reward, unlocks: await evaluateAchievements(userId, lesson.cycleId) };
}

export async function listTasks(userId: number) { const db = await database(); return db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))).orderBy(tasks.status, tasks.scheduledFor, desc(tasks.createdAt)); }
export async function createTask(userId: number, input: { title: string; description?: string; scheduledFor?: string; deadline?: Date; priority: "urgent" | "medium" | "low"; category?: string }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(tasks).values({ userId, cycleId: cycle.id, title: input.title, description: input.description ?? null, scheduledFor: input.scheduledFor ?? dateKey(), deadline: input.deadline ?? null, priority: input.priority, category: input.category ?? "دراسة" }); }
export async function completeTask(userId: number, taskId: number, completedAt = new Date(), expectedUpdatedAt?: number) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const ownerTask = and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt));
    const [item] = await tx.select().from(tasks).where(ownerTask).for("update");
    if (!item && expectedUpdatedAt !== undefined) return {
      alreadyCompleted: false, awarded: false, amount: 0, cycleId: null,
      conflict: { missing: true as const },
    };
    if (!item) throw new Error("المهمة غير موجودة.");
    if (!isFirstCompletion(item.status)) return { alreadyCompleted: true, awarded: false, amount: 0, cycleId: item.cycleId };

    if (expectedUpdatedAt !== undefined && +item.updatedAt !== expectedUpdatedAt) return {
      alreadyCompleted: false, awarded: false, amount: 0, cycleId: item.cycleId,
      conflict: { missing: false as const, title: item.title, day: item.scheduledFor, updatedAt: +item.updatedAt },
    };

    const reference = `task:${taskId}:complete`;
    await tx.update(tasks).set({ status: "completed", completedAt }).where(ownerTask);
    const [event] = await tx.select({ id: studyEvents.id }).from(studyEvents)
      .where(and(eq(studyEvents.userId, userId), eq(studyEvents.referenceId, reference))).limit(1);
    if (!event) await tx.insert(studyEvents).values({
      userId, cycleId: item.cycleId, eventType: "task_complete", referenceId: reference, occurredAt: completedAt,
    });
    const [prior] = await tx.select({ id: coinTransactions.id }).from(coinTransactions)
      .where(eq(coinTransactions.referenceKey, reference)).limit(1);
    const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
      .where(eq(coinRateSettings.rateKey, `task_${item.priority}`)).limit(1);
    const amount = prior ? 0 : rate?.amount ?? taskRewardForPriority(item.priority);
    if (amount > 0) await tx.insert(coinTransactions).values({
      userId, cycleId: item.cycleId, amount, type: "earn", referenceKey: reference,
      reason: `إكمال مهمة: ${item.title}`, createdAt: completedAt,
    });
    return { alreadyCompleted: false, awarded: amount > 0, amount, cycleId: item.cycleId, balance: (await getCoinSummary(tx, userId)).balance };
  });
  const { cycleId, ...completion } = result;
  const unlocks = result.alreadyCompleted || result.conflict || cycleId === null ? [] : await evaluateAchievements(userId, cycleId).catch(() => []);
  return { ...completion, unlocks };
}
export async function updateTask(userId: number, taskId: number, input: { title: string; description?: string; scheduledFor?: string; deadline?: Date; priority: "urgent" | "medium" | "low"; category?: string }) { const db = await database(); return db.update(tasks).set({ title: input.title, description: input.description ?? null, scheduledFor: input.scheduledFor ?? null, deadline: input.deadline ?? null, priority: input.priority, category: input.category ?? "دراسة" }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt))); }
export async function deleteTask(userId: number, taskId: number) { const db = await database(); return db.update(tasks).set({ deletedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt))); }

export async function listLessonSources(userId: number) {
  const db = await database();
  return db.select().from(lessonSources).where(eq(lessonSources.userId, userId)).orderBy(lessonSources.subject, lessonSources.createdAt);
}

export async function createLessonSource(userId: number, input: LessonSourceDraft) {
  const db = await database();
  await db.insert(lessonSources).values({
    userId,
    subject: input.subject,
    platform: input.platform,
    teacherName: input.teacherName,
    delivery: input.delivery,
    role: input.role,
    url: input.url ?? null,
    location: input.location ?? null,
    weeklyPlan: input.weeklyPlan ?? null,
    notes: input.notes ?? null,
  });
}

async function ownedLessonSource(db: any, userId: number, sourceId: number) {
  const row = await db.select({ id: lessonSources.id }).from(lessonSources).where(and(eq(lessonSources.id, sourceId), eq(lessonSources.userId, userId))).limit(1);
  if (!row[0]) throw new Error("مصدر الدرس غير موجود.");
}

export async function updateLessonSource(userId: number, sourceId: number, input: LessonSourceDraft & { active: boolean }) {
  const db = await database();
  await ownedLessonSource(db, userId, sourceId);
  return db.update(lessonSources).set({
    subject: input.subject,
    platform: input.platform,
    teacherName: input.teacherName,
    delivery: input.delivery,
    role: input.role,
    url: input.url ?? null,
    location: input.location ?? null,
    weeklyPlan: input.weeklyPlan ?? null,
    notes: input.notes ?? null,
    active: input.active,
  }).where(eq(lessonSources.id, sourceId));
}

export async function deleteLessonSource(userId: number, sourceId: number) {
  const db = await database();
  await ownedLessonSource(db, userId, sourceId);
  return db.delete(lessonSources).where(eq(lessonSources.id, sourceId));
}

export async function seedSeifLessonSources(userId: number) {
  const db = await database();
  for (const source of seifLessonSourceDefaults) {
    const existing = await db.select({ id: lessonSources.id }).from(lessonSources).where(and(
      eq(lessonSources.userId, userId),
      eq(lessonSources.subject, source.subject),
      eq(lessonSources.platform, source.platform),
      eq(lessonSources.teacherName, source.teacherName),
    )).limit(1);
    if (!existing[0]) await db.insert(lessonSources).values({ ...source, userId, url: source.url ?? null, location: source.location ?? null, weeklyPlan: source.weeklyPlan ?? null, notes: source.notes ?? null });
  }
  return listLessonSources(userId);
}

export async function listAssistantChats(userId: number) {
  const db = await database();
  return db.select().from(assistantChats).where(and(eq(assistantChats.userId, userId), isNull(assistantChats.deletedAt))).orderBy(desc(assistantChats.updatedAt), desc(assistantChats.id));
}
export async function createAssistantChat(userId: number) {
  const db = await database();
  const [result] = await db.insert(assistantChats).values({ userId, title: "محادثة جديدة" });
  return { id: result.insertId };
}
export async function ownedAssistantChat(userId: number, chatId: number) {
  const db = await database();
  const [chat] = await db.select().from(assistantChats).where(and(eq(assistantChats.userId, userId), eq(assistantChats.id, chatId), isNull(assistantChats.deletedAt))).limit(1);
  if (!chat) throw new Error("المحادثة مش موجودة.");
  return chat;
}
export async function renameAssistantChat(userId: number, title: string, chatId?: number) {
  const db = await database();
  if (chatId !== undefined) {
    await ownedAssistantChat(userId, chatId);
    await db.update(assistantChats).set({ title })
      .where(and(eq(assistantChats.userId, userId), eq(assistantChats.id, chatId)));
    return { id: chatId };
  }

  return db.transaction(async tx => {
    const [result] = await tx.insert(assistantChats).values({ userId, title });
    await tx.update(assistantMessages).set({ chatId: result.insertId })
      .where(and(eq(assistantMessages.userId, userId), isNull(assistantMessages.chatId)));
    return { id: result.insertId };
  });
}

export async function deleteAssistantChat(userId: number, chatId?: number) {
  const db = await database();
  const deletedAt = new Date();
  if (chatId !== undefined) {
    await db.update(assistantChats).set({ deletedAt })
      .where(and(eq(assistantChats.userId, userId), eq(assistantChats.id, chatId), isNull(assistantChats.deletedAt)));
  } else {
    await db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const legacy = and(eq(assistantMessages.userId, userId), isNull(assistantMessages.chatId));
      const [message] = await tx.select({ id: assistantMessages.id }).from(assistantMessages).where(legacy).limit(1);
      if (!message) return;
      const [chat] = await tx.insert(assistantChats).values({ userId, title: "المحادثة السابقة", deletedAt });
      await tx.update(assistantMessages).set({ chatId: chat.insertId }).where(legacy);
    });
  }
  return { ok: true };
}

export async function listAssistantMessages(userId: number, limit = 24, chatId?: number) {
  const db = await database();
  if (chatId !== undefined) await ownedAssistantChat(userId, chatId);
  const rows = await db.select().from(assistantMessages)
    .where(and(eq(assistantMessages.userId, userId), chatId === undefined ? isNull(assistantMessages.chatId) : eq(assistantMessages.chatId, chatId)))
    .orderBy(desc(assistantMessages.id)).limit(limit);
  return rows.reverse();
}
export async function saveAssistantMessage(userId: number, role: "user" | "assistant", content: string, chatId?: number) {
  const db = await database();
  const message = { userId, role, content: content.slice(0, 5000), chatId };
  if (chatId === undefined) {
    await db.insert(assistantMessages).values(message);
    return;
  }

  await db.transaction(async tx => {
    const ownerChat = and(eq(assistantChats.userId, userId), eq(assistantChats.id, chatId), isNull(assistantChats.deletedAt));
    const [chat] = await tx.select().from(assistantChats).where(ownerChat).for("update");
    if (!chat) throw new Error("المحادثة مش موجودة.");
    await tx.insert(assistantMessages).values(message);
    await tx.update(assistantChats).set({
      updatedAt: new Date(),
      ...(role === "user" && chat.title === "محادثة جديدة"
        ? { title: [...content.replace(/\s+/g, " ").trim()].slice(0, 65).join("") }
        : {}),
    }).where(ownerChat);
  });
}

export async function getDailyStudySummary(userId: number) {
  const db = await database(); const cycle = await getActiveCycle(userId); const today = dateKey();
  const existing = await db.select().from(dailyStudySummaries).where(and(eq(dailyStudySummaries.userId, userId), eq(dailyStudySummaries.summaryDate, today))).limit(1);
  if (existing[0]) return { ...existing[0], isNew: false };
  const openTasks = await db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.status, "open"), lte(tasks.scheduledFor, today))).orderBy(desc(tasks.priority), tasks.scheduledFor).limit(6);
  const dueToday = openTasks.filter(task => task.scheduledFor === today);
  const urgent = openTasks.filter(task => task.priority === "urgent");
  const upcoming = await db.select({ title: exams.title, scheduledAt: exams.scheduledAt }).from(exams).where(and(eq(exams.userId, userId), isNull(exams.archivedAt), gte(exams.scheduledAt, new Date()))).orderBy(exams.scheduledAt).limit(1);
  const names = openTasks.slice(0, 3).map(task => `«${task.title}»`).join("، ");
  const content = `صباح الفل يا سيف. النهاردة عندك ${dueToday.length} مهمة متخططلها${urgent.length ? `، منهم ${urgent.length} مهم` : ""}. ${openTasks.length ? `ابدأ بـ ${names}.` : "جدولك فاضي حاليًا؛ حط مهمة صغيرة ونكسب اليوم."}${upcoming[0]?.scheduledAt ? ` والامتحان الجاي «${upcoming[0].title}» يوم ${upcoming[0].scheduledAt.toLocaleDateString("ar-EG")}.` : ""}`;
  await db.insert(dailyStudySummaries).values({ userId, cycleId: cycle.id, summaryDate: today, content }).onDuplicateKeyUpdate({ set: { userId } });
  const stored = await db.select().from(dailyStudySummaries).where(and(eq(dailyStudySummaries.userId, userId), eq(dailyStudySummaries.summaryDate, today))).limit(1);
  return { ...stored[0], isNew: true };
}

export async function listHabits(userId: number) { const db = await database(); const items = await db.select().from(habits).where(eq(habits.userId, userId)); const todays = await db.select().from(habitCompletions).where(and(eq(habitCompletions.userId, userId), eq(habitCompletions.completedOn, dateKey()))); return { items, completedIds: todays.map((x: any) => x.habitId) }; }
export async function createHabit(userId: number, input: { name: string; frequency: "daily" | "weekly"; target: number }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(habits).values({ userId, cycleId: cycle.id, ...input }); }
export async function completeHabit(userId: number, habitId: number, completedOn = dateKey()) { const db = await database(); const item = await db.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))).limit(1); if (!item[0]) throw new Error("العادة غير موجودة."); const prior = await db.select().from(habitCompletions).where(and(eq(habitCompletions.habitId, habitId), eq(habitCompletions.completedOn, completedOn))).limit(1); if (prior[0]) return { alreadyCompleted: true, awarded: false, unlocks: [] }; await db.insert(habitCompletions).values({ userId, habitId, cycleId: item[0].cycleId, completedOn }); const ref = `habit:${habitId}:${completedOn}`; await recordStudyEvent({ userId, cycleId: item[0].cycleId, eventType: "habit_complete", referenceId: ref }); const reward = await awardCoins({ userId, cycleId: item[0].cycleId, amount: 10, rateKey: "habit_complete", reason: `إكمال عادة: ${item[0].name}`, referenceKey: ref }); return { alreadyCompleted: false, ...reward, unlocks: await evaluateAchievements(userId, item[0].cycleId) }; }
export async function updateHabit(userId: number, habitId: number, input: { name: string; frequency: "daily" | "weekly"; target: number }) { const db = await database(); return db.update(habits).set(input).where(and(eq(habits.id, habitId), eq(habits.userId, userId))); }
export async function deleteHabit(userId: number, habitId: number) { const db = await database(); return db.delete(habits).where(and(eq(habits.id, habitId), eq(habits.userId, userId))); }

export async function listGoals(userId: number) { const db = await database(); return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(goals.status, desc(goals.progress)); }
export async function createGoal(userId: number, input: { title: string; description?: string; deadline?: Date; milestones?: Array<{ title: string; targetPercent: number }> }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(goals).values({ userId, cycleId: cycle.id, title: input.title, description: input.description ?? null, deadline: input.deadline ?? null }); const goal = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.title, input.title))).orderBy(desc(goals.id)).limit(1); if (goal[0] && input.milestones?.length) await db.insert(goalMilestones).values(input.milestones.map(m => ({ goalId: goal[0].id, ...m }))); }
export async function updateGoalProgress(userId: number, goalId: number, progress: number) { const db = await database(); const item = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId))).limit(1); if (!item[0]) throw new Error("الهدف غير موجود."); const finalProgress = Math.min(100, Math.max(0, progress)); const becomesComplete = finalProgress >= 100 && item[0].status !== "completed"; await db.update(goals).set({ progress: finalProgress, status: finalProgress >= 100 ? "completed" : "active", completedAt: finalProgress >= 100 ? new Date() : null }).where(eq(goals.id, goalId)); await db.update(goalMilestones).set({ completedAt: new Date() }).where(and(eq(goalMilestones.goalId, goalId), lte(goalMilestones.targetPercent, finalProgress))); if (!becomesComplete) return { completedNow: false, awarded: false, unlocks: [] }; const ref = `goal:${goalId}:complete`; await recordStudyEvent({ userId, cycleId: item[0].cycleId, eventType: "goal_complete", referenceId: ref }); const reward = await awardCoins({ userId, cycleId: item[0].cycleId, amount: 50, rateKey: "goal_complete", reason: `إكمال هدف: ${item[0].title}`, referenceKey: ref }); return { completedNow: true, ...reward, unlocks: await evaluateAchievements(userId, item[0].cycleId) }; }
export async function updateGoal(userId: number, goalId: number, input: { title: string; description?: string; deadline?: Date }) { const db = await database(); return db.update(goals).set({ title: input.title, description: input.description ?? null, deadline: input.deadline ?? null }).where(and(eq(goals.id, goalId), eq(goals.userId, userId))); }
export async function deleteGoal(userId: number, goalId: number) { const db = await database(); return db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId))); }

export async function listPomodoros(userId: number) { const db = await database(); return db.select().from(pomodoroSessions).where(eq(pomodoroSessions.userId, userId)).orderBy(desc(pomodoroSessions.createdAt)); }
export async function startPomodoro(userId: number, input: { plannedMinutes: 15 | 25 | 45 | 60; subjectId?: number }) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [active] = await tx.select().from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, userId), inArray(pomodoroSessions.state, ["running", "paused"])))
      .orderBy(desc(pomodoroSessions.id)).limit(1);
    if (active) return active;
    const subjectId = input.subjectId ?? null;
    if (subjectId !== null) {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects)
        .where(and(eq(subjects.userId, userId), eq(subjects.id, subjectId)));
      if (!subject) throw new Error("المادة مش موجودة.");
    }
    const [result] = await tx.insert(pomodoroSessions).values({ userId, cycleId: cycle.id, plannedMinutes: input.plannedMinutes, subjectId });
    const [created] = await tx.select().from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.id, result.insertId)));
    return created;
  });
}
export async function completePomodoro(userId: number, sessionId: number) { const db = await database(); const session = await db.select().from(pomodoroSessions).where(and(eq(pomodoroSessions.id, sessionId), eq(pomodoroSessions.userId, userId))).limit(1); if (!session[0]) throw new Error("جلسة Pomodoro غير موجودة."); if (session[0].state === "completed") return { alreadyCompleted: true, awarded: false, unlocks: [] }; if (session[0].state !== "running") throw new Error("استأنف الجلسة قبل إكمالها."); const elapsed = Date.now() - session[0].startedAt.getTime() - session[0].pausedSeconds * 1000; if (elapsed < session[0].plannedMinutes * 60_000 * 0.9) throw new Error("لا يمكن منح المكافأة قبل إكمال الجلسة بالكامل."); await db.update(pomodoroSessions).set({ state: "completed", completedMinutes: session[0].plannedMinutes, completedAt: new Date(), pausedAt: null }).where(eq(pomodoroSessions.id, sessionId)); const ref = `pomodoro:${sessionId}:complete`; await recordStudyEvent({ userId, cycleId: session[0].cycleId, subjectId: session[0].subjectId, eventType: "pomodoro_complete", referenceId: ref, durationMinutes: session[0].plannedMinutes }); const reward = await awardCoins({ userId, cycleId: session[0].cycleId, amount: coinRewardForPomodoro(session[0].plannedMinutes), rateKey: ("pomodoro_" + session[0].plannedMinutes) as CoinRateKey, reason: `Pomodoro مكتمل — ${session[0].plannedMinutes} دقيقة`, referenceKey: ref }); return { alreadyCompleted: false, ...reward, unlocks: await evaluateAchievements(userId, session[0].cycleId) }; }
export async function pausePomodoro(userId: number, sessionId: number, paused: boolean) { const db = await database(); const rows = await db.select().from(pomodoroSessions).where(and(eq(pomodoroSessions.id, sessionId), eq(pomodoroSessions.userId, userId))).limit(1); const session = rows[0]; if (!session || !["running", "paused"].includes(session.state)) throw new Error("لا يمكن تعديل هذه الجلسة."); if (paused && session.state === "running") return db.update(pomodoroSessions).set({ state: "paused", pausedAt: new Date() }).where(eq(pomodoroSessions.id, sessionId)); if (!paused && session.state === "paused") { const pauseSeconds = session.pausedAt ? Math.max(0, Math.floor((Date.now() - session.pausedAt.getTime()) / 1000)) : 0; return db.update(pomodoroSessions).set({ state: "running", pausedAt: null, pausedSeconds: session.pausedSeconds + pauseSeconds }).where(eq(pomodoroSessions.id, sessionId)); } return { rowsAffected: 0 }; }

export async function startVideoSession(userId: number, input: { videoUrl: string; lessonTitle?: string; subject: "arabic" | "history" | "english" | "programming_ai" | "german" | "other"; requestedMode: "auto" | "embedded" | "external" }) { const db = await database(); const cycle = await getActiveCycle(userId); const detected = classifyStudySource(input.videoUrl); if (detected === "invalid") throw new Error("رابط الدرس غير صالح."); const sourceMode = input.requestedMode === "external" || detected === "external" ? "external" : "embedded"; await db.insert(studyVideoSessions).values({ userId, cycleId: cycle.id, videoUrl: input.videoUrl, lessonTitle: input.lessonTitle || null, subject: input.subject, sourceMode, manualProgress: "started", timerRunning: false, lastPlaybackAt: null, phase: "watching" }); const created = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.userId, userId)).orderBy(desc(studyVideoSessions.id)).limit(1); return created[0]; }
export async function endVideoSession(userId: number, sessionId: number) { const db = await database(); const rows = await db.select().from(studyVideoSessions).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))).limit(1); const item = rows[0]; if (!item) throw new Error("جلسة الفيديو غير موجودة."); const now = new Date(); const addedSeconds = item.sourceMode === "external" && item.timerRunning && item.lastPlaybackAt ? Math.min(10_800, Math.max(0, Math.floor((now.getTime() - item.lastPlaybackAt.getTime()) / 1000))) : 0; const activeSeconds = item.activeSeconds + addedSeconds; const previousBlocks = Math.floor(item.activeSeconds / 2700); const completedBlocks = Math.floor(activeSeconds / 2700); await db.update(studyVideoSessions).set({ phase: "completed", lastPlaybackAt: null, timerRunning: false, activeSeconds, completedBlocks }).where(eq(studyVideoSessions.id, sessionId)); if (completedBlocks > previousBlocks) { const ref = `video:${sessionId}:block:${completedBlocks}`; await recordStudyEvent({ userId, cycleId: item.cycleId, eventType: "video_block", referenceId: ref, durationMinutes: 45 }); await awardCoins({ userId, cycleId: item.cycleId, amount: 25, rateKey: "video_block", reason: "فيديو مذاكرة — 45 دقيقة", referenceKey: ref }); await evaluateAchievements(userId, item.cycleId); } return { ended: true, activeSeconds }; }
export async function currentVideoSession(userId: number) {
  const db = await database();
  const [latest] = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.userId, userId))
    .orderBy(desc(studyVideoSessions.updatedAt), desc(studyVideoSessions.id)).limit(1);
  return latest && (latest.phase === "watching" || latest.phase === "break") ? latest : null;
}
export async function listVideoSessions(userId: number) { const db = await database(); const sessions = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.userId, userId)).orderBy(desc(studyVideoSessions.updatedAt)); return Promise.all(sessions.map(async session => ({ ...session, notes: await db.select().from(videoNotes).where(and(eq(videoNotes.userId, userId), eq(videoNotes.sessionId, session.id))).orderBy(desc(videoNotes.updatedAt)) }))); }
export async function createVideoNote(userId: number, input: { sessionId: number; title: string; content: string; timestampSeconds?: number }) { const db = await database(); const session = await db.select({ id: studyVideoSessions.id }).from(studyVideoSessions).where(and(eq(studyVideoSessions.id, input.sessionId), eq(studyVideoSessions.userId, userId))).limit(1); if (!session[0]) throw new Error("جلسة الفيديو غير موجودة."); await db.insert(videoNotes).values({ userId, sessionId: input.sessionId, title: input.title, content: input.content, timestampSeconds: input.timestampSeconds ?? null }); }
export async function updateVideoNote(userId: number, noteId: number, input: { title: string; content: string; timestampSeconds?: number }) { const db = await database(); const result = await db.update(videoNotes).set({ title: input.title, content: input.content, timestampSeconds: input.timestampSeconds ?? null }).where(and(eq(videoNotes.id, noteId), eq(videoNotes.userId, userId))); if (!result) throw new Error("الملاحظة غير موجودة."); }
export async function deleteVideoNote(userId: number, noteId: number) { const db = await database(); return db.delete(videoNotes).where(and(eq(videoNotes.id, noteId), eq(videoNotes.userId, userId))); }
export async function trackVideoPlayback(userId: number, sessionId: number, input: { active: boolean; playbackPosition?: number }) { const db = await database(); const session = await db.select().from(studyVideoSessions).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))).limit(1); if (!session[0]) throw new Error("جلسة الفيديو غير موجودة."); const item = session[0]; const now = new Date(); if (item.phase === "break") return { session: item, addedSeconds: 0, blockCompleted: false, phase: "break" as const }; if (item.phase !== "watching") return { session: item, addedSeconds: 0, blockCompleted: false, phase: item.phase };
  const position = Math.max(0, Math.floor(input.playbackPosition ?? item.lastPlaybackPosition ?? 0)); if (!input.active) { await db.update(studyVideoSessions).set({ lastPlaybackAt: null, lastPlaybackPosition: position }).where(eq(studyVideoSessions.id, sessionId)); return { session: item, addedSeconds: 0, blockCompleted: false, phase: "watching" as const }; }
  if (!item.lastPlaybackAt || item.lastPlaybackPosition === null) { await db.update(studyVideoSessions).set({ lastPlaybackAt: now, lastPlaybackPosition: position }).where(eq(studyVideoSessions.id, sessionId)); const updated = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.id, sessionId)).limit(1); return { session: updated[0], addedSeconds: 0, blockCompleted: false, phase: "watching" as const }; }
  const elapsedOnServer = Math.max(0, Math.floor((now.getTime() - item.lastPlaybackAt.getTime()) / 1000)); const addedSeconds = validatedVideoIncrement(item.lastPlaybackPosition, position, elapsedOnServer); const previousBlocks = Math.floor(item.activeSeconds / 2700); const activeSeconds = item.activeSeconds + addedSeconds; const nextBlocks = Math.floor(activeSeconds / 2700); const blockCompleted = nextBlocks > previousBlocks; const breakEndsAt = blockCompleted ? new Date(now.getTime() + 15 * 60_000) : null; await db.update(studyVideoSessions).set({ activeSeconds, completedBlocks: nextBlocks, phase: blockCompleted ? "break" : "watching", breakEndsAt, lastPlaybackAt: blockCompleted ? null : now, lastPlaybackPosition: position }).where(eq(studyVideoSessions.id, sessionId)); if (blockCompleted) { const ref = `video:${sessionId}:block:${nextBlocks}`; await recordStudyEvent({ userId, cycleId: item.cycleId, eventType: "video_block", referenceId: ref, durationMinutes: 45 }); await awardCoins({ userId, cycleId: item.cycleId, amount: 25, rateKey: "video_block", reason: "فيديو مذاكرة — 45 دقيقة", referenceKey: ref }); await evaluateAchievements(userId, item.cycleId); } const updated = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.id, sessionId)).limit(1); return { session: updated[0], addedSeconds, blockCompleted, phase: updated[0].phase }; }
export async function resumeVideoSession(userId: number, sessionId: number) { const db = await database(); const item = await db.select().from(studyVideoSessions).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))).limit(1); if (!item[0]) throw new Error("جلسة الفيديو غير موجودة."); if (item[0].phase === "break" && item[0].breakEndsAt && item[0].breakEndsAt.getTime() > Date.now()) throw new Error("فترة الاستراحة لم تنتهِ بعد."); await db.update(studyVideoSessions).set({ phase: "watching", breakEndsAt: null, lastPlaybackAt: new Date() }).where(eq(studyVideoSessions.id, sessionId)); return { resumed: true }; }
export async function setVideoManualProgress(userId: number, sessionId: number, progress: "started" | "middle" | "finished" | "reviewed") { const db = await database(); const result = await db.update(studyVideoSessions).set({ manualProgress: progress }).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))); if (!result[0]?.affectedRows) throw new Error("جلسة الفيديو غير موجودة."); return { progress }; }
export async function setExternalVideoTimer(userId: number, sessionId: number, running: boolean) { const db = await database(); const rows = await db.select().from(studyVideoSessions).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))).limit(1); const item = rows[0]; if (!item) throw new Error("جلسة الفيديو غير موجودة."); if (item.sourceMode !== "external") throw new Error("هذا المؤقت مخصص للدروس الخارجية فقط."); if (item.phase === "completed") throw new Error("تم إنهاء الجلسة بالفعل."); const now = new Date(); if (running) { if (item.phase === "break" && item.breakEndsAt && item.breakEndsAt.getTime() > now.getTime()) throw new Error("فترة الاستراحة لم تنتهِ بعد."); await db.update(studyVideoSessions).set({ timerRunning: true, phase: "watching", breakEndsAt: null, lastPlaybackAt: now }).where(eq(studyVideoSessions.id, sessionId)); return { running: true, activeSeconds: item.activeSeconds }; }
  const addedSeconds = item.timerRunning && item.lastPlaybackAt ? Math.min(10_800, Math.max(0, Math.floor((now.getTime() - item.lastPlaybackAt.getTime()) / 1000))) : 0; const activeSeconds = item.activeSeconds + addedSeconds; const previousBlocks = Math.floor(item.activeSeconds / 2700); const completedBlocks = Math.floor(activeSeconds / 2700); const blockCompleted = completedBlocks > previousBlocks; const breakEndsAt = blockCompleted ? new Date(now.getTime() + 15 * 60_000) : null; await db.update(studyVideoSessions).set({ activeSeconds, completedBlocks, timerRunning: false, phase: blockCompleted ? "break" : "watching", breakEndsAt, lastPlaybackAt: null }).where(eq(studyVideoSessions.id, sessionId)); if (blockCompleted) { const ref = `video:${sessionId}:block:${completedBlocks}`; await recordStudyEvent({ userId, cycleId: item.cycleId, eventType: "video_block", referenceId: ref, durationMinutes: 45 }); await awardCoins({ userId, cycleId: item.cycleId, amount: 25, rateKey: "video_block", reason: "فيديو مذاكرة — 45 دقيقة", referenceKey: ref }); await evaluateAchievements(userId, item.cycleId); } return { running: false, activeSeconds, blockCompleted }; }

export function fallbackComprehension(score: number, difficulty: "easy" | "medium" | "hard", priorAverage: number) { return deriveFallbackComprehension(score, difficulty, priorAverage); }
async function estimateComprehension(input: { score: number; correctAnswers: number; incorrectAnswers: number; difficulty: "easy" | "medium" | "hard"; missedTopics: string[]; priorAverage: number }) { const fallback = fallbackComprehension(input.score, input.difficulty, input.priorAverage); try { const response = await invokeLLM({ messages: [{ role: "system", content: "You are a careful study analyst. Return only a JSON object with a whole-number comprehensionScore from 0 to 100. Use exam score, errors, difficulty, missed topics, and previous average. Never award coins." }, { role: "user", content: JSON.stringify(input) }], response_format: { type: "json_schema", json_schema: { name: "comprehension", strict: true, schema: { type: "object", properties: { comprehensionScore: { type: "integer", minimum: 0, maximum: 100 } }, required: ["comprehensionScore"], additionalProperties: false } } } }); const content = response.choices[0]?.message?.content; const parsed = typeof content === "string" ? JSON.parse(content) : null; return Math.max(0, Math.min(100, Number(parsed?.comprehensionScore ?? fallback))); } catch { return fallback; }
}
export async function listExamsLegacy(userId: number) { const db = await database(); return db.select({ exam: exams, subject: subjects.title }).from(exams).leftJoin(subjects, eq(exams.subjectId, subjects.id)).where(eq(exams.userId, userId)).orderBy(exams.scheduledAt); }
export async function createExamLegacy(userId: number, input: { title: string; subjectId?: number; chapterId?: number; lessonId?: number; scheduledAt?: Date }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(exams).values({ userId, cycleId: cycle.id, ...input, subjectId: input.subjectId ?? null, chapterId: input.chapterId ?? null, lessonId: input.lessonId ?? null, scheduledAt: input.scheduledAt ?? null }); }
export async function completeExamAttempt(userId: number, input: { examId: number; totalQuestions: number; correctAnswers: number; difficulty: "easy" | "medium" | "hard"; missedTopics: string[] }) { const db = await database(); const exam = await db.select().from(exams).where(and(eq(exams.id, input.examId), eq(exams.userId, userId), isNull(exams.archivedAt))).limit(1); if (!exam[0]) throw new Error("الامتحان غير موجود."); if (input.correctAnswers > input.totalQuestions) throw new Error("عدد الإجابات الصحيحة غير صحيح."); const incorrectAnswers = input.totalQuestions - input.correctAnswers; const score = Math.round((input.correctAnswers / input.totalQuestions) * 100); const [prior] = await db.select({ average: sql<number>`coalesce(avg(${examAttempts.score}), 0)` }).from(examAttempts).where(eq(examAttempts.userId, userId)); const comprehensionScore = await estimateComprehension({ score, correctAnswers: input.correctAnswers, incorrectAnswers, difficulty: input.difficulty, missedTopics: input.missedTopics, priorAverage: Number(prior?.average ?? 0) }); await db.insert(examAttempts).values({ userId, cycleId: exam[0].cycleId, examId: input.examId, totalQuestions: input.totalQuestions, correctAnswers: input.correctAnswers, incorrectAnswers, score, difficulty: input.difficulty, missedTopics: input.missedTopics, comprehensionScore, completionRewarded: true }); const attempt = await db.select().from(examAttempts).where(and(eq(examAttempts.examId, input.examId), eq(examAttempts.userId, userId))).orderBy(desc(examAttempts.id)).limit(1); const ref = `examAttempt:${attempt[0].id}`; await recordStudyEvent({ userId, cycleId: exam[0].cycleId, eventType: "exam_complete", referenceId: ref }); const completion = await awardCoins({ userId, cycleId: exam[0].cycleId, amount: 15, rateKey: "exam_complete", reason: `إكمال امتحان: ${exam[0].title}`, referenceKey: `${ref}:completion` }); const bonusDefault = examBonusForComprehension(comprehensionScore); const threshold = [95, 90, 80, 70, 60].find(value => comprehensionScore >= value); const bonus = threshold ? await awardCoins({ userId, cycleId: exam[0].cycleId, amount: bonusDefault, rateKey: ("exam_bonus_" + threshold) as CoinRateKey, reason: `مكافأة الاستيعاب: ${comprehensionScore}%`, referenceKey: `${ref}:comprehension` }) : { awarded: false, amount: 0 }; return { attempt: attempt[0], score, comprehensionScore, completion, bonus, bonusAmount: bonus.amount, unlocks: await evaluateAchievements(userId, exam[0].cycleId) }; }


export async function listCalendar(userId: number, from: Date, to: Date) { const db = await database(); const [taskItems, examItems, goalItems, customItems, sessions] = await Promise.all([db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), gte(tasks.deadline, from), lte(tasks.deadline, to))), db.select().from(exams).where(and(eq(exams.userId, userId), isNull(exams.archivedAt), gte(exams.scheduledAt, from), lte(exams.scheduledAt, to))), db.select().from(goals).where(and(eq(goals.userId, userId), gte(goals.deadline, from), lte(goals.deadline, to))), db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId), gte(calendarEvents.startsAt, from), lte(calendarEvents.startsAt, to))), db.select().from(pomodoroSessions).where(and(eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.state, "completed"), gte(pomodoroSessions.completedAt, from), lte(pomodoroSessions.completedAt, to)))]); return { tasks: taskItems, exams: examItems, goals: goalItems, events: customItems, sessions }; }
export async function createCalendarEvent(userId: number, input: { title: string; startsAt: Date; endsAt?: Date; eventType: "important_date" | "custom" }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(calendarEvents).values({ userId, cycleId: cycle.id, title: input.title, startsAt: input.startsAt, endsAt: input.endsAt ?? null, eventType: input.eventType }); }

export async function listRewards(userId: number, canManage = false) {
  const db = await database();
  await seedCatalogs(db);
  const [catalog, coins, purchases] = await Promise.all([
    db.select().from(rewards).where(canManage ? undefined : eq(rewards.active, true)).orderBy(rewards.catalogId),
    getCoinSummary(db, userId),
    db.select({ rewardId: rewardPurchases.rewardId, purchasedAt: rewardPurchases.purchasedAt })
      .from(rewardPurchases).where(eq(rewardPurchases.userId, userId)).orderBy(desc(rewardPurchases.purchasedAt)),
  ]);
  return { items: catalog.filter(item => item.active), archived: catalog.filter(item => !item.active), coins, purchases, canManage };
}

export async function createReward(userId: number, input: { title: string; cost: number; rarity: typeof rewards.$inferInsert.rarity }) {
  const db = await database();
  await seedCatalogs(db);
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [previous] = await tx.select({ catalogId: rewards.catalogId }).from(rewards).orderBy(rewards.catalogId).limit(1);
    const catalogId = Math.min(0, previous?.catalogId ?? 0) - 1;
    await tx.insert(rewards).values({ ...input, catalogId });
    return { success: true };
  });
}

export async function setRewardActive(rewardId: number, active: boolean) {
  const db = await database();
  await db.update(rewards).set({ active }).where(eq(rewards.id, rewardId));
  return { success: true };
}

export async function purchaseReward(userId: number, rewardId: number, referenceKey: string) { const db = await database(); const cycle = await getActiveCycle(userId); return db.transaction(async tx => { await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update"); const purchased = await tx.select({ id: rewardPurchases.id }).from(rewardPurchases).where(eq(rewardPurchases.referenceKey, referenceKey)).limit(1); const priorBalance = (await getCoinSummary(tx, userId)).balance; if (purchased[0] || decideRewardPurchase({ hasPriorReference: Boolean(purchased[0]), balance: priorBalance, cost: 0 }) === "duplicate") return { purchased: false, reason: "already_purchased", balance: priorBalance }; const reward = await tx.select().from(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.active, true))).limit(1); if (!reward[0]) throw new Error("المكافأة غير متاحة."); const coins = await getCoinSummary(tx, userId); if (decideRewardPurchase({ hasPriorReference: false, balance: coins.balance, cost: reward[0].cost }) !== "approved") throw new Error("لا توجد Coins كافية لشراء هذه المكافأة."); await tx.insert(rewardPurchases).values({ userId, cycleId: cycle.id, rewardId, cost: reward[0].cost, referenceKey }); await tx.insert(coinTransactions).values({ userId, cycleId: cycle.id, amount: -reward[0].cost, type: "spend", reason: `شراء مكافأة: ${reward[0].title}`, referenceKey: `purchase:${referenceKey}` }); return { purchased: true, reward: reward[0].title, balance: coins.balance - reward[0].cost }; }); }

export async function listAchievements(userId: number) {
  const db = await database();
  await seedCatalogs(db);
  const metrics = await metricSnapshot(db, userId) as Record<string, number>;
  const [catalog, awards] = await Promise.all([
    db.select().from(achievements).orderBy(achievements.catalogId),
    db.select({ id: userAchievements.achievementId, unlockedAt: userAchievements.unlockedAt })
      .from(userAchievements).where(eq(userAchievements.userId, userId)).orderBy(userAchievements.unlockedAt),
  ]);
  const firstAwards = new Map<number, Date>();
  for (const award of awards) {
    if (!firstAwards.has(award.id)) firstAwards.set(award.id, award.unlockedAt);
  }
  const items = catalog.map(achievement => {
    const current = Math.min(achievement.target, metrics[achievement.metric] ?? 0);
    return { ...achievement, unlockedAt: firstAwards.get(achievement.id) ?? null, current, percent: Math.round((current / achievement.target) * 100) };
  });
  return { items, unlocked: items.filter(item => item.unlockedAt).length };
}

export async function coinLedger(userId: number) { const db = await database(); const cycle = await getActiveCycle(userId); const [summary, entries] = await Promise.all([getCoinSummary(db, userId), db.select().from(coinTransactions).where(eq(coinTransactions.userId, userId)).orderBy(desc(coinTransactions.createdAt))]); return { cycle, summary, entries }; }


type ExamLessonInput = { title: string; chapterTitle: string; subjectTitle: string; progress: number; status: "not_started" | "in_progress" | "completed"; lastReviewedAt: Date | null };

function readinessForLessons(items: ExamLessonInput[]) {
  const total = items.length;
  if (!total) return { score: 0, level: "أضف الدروس أولًا", completed: 0, reviewed: 0, weakLessons: [] as ExamLessonInput[] };
  const completed = items.filter(item => item.status === "completed").length;
  const reviewed = items.filter(item => Boolean(item.lastReviewedAt)).length;
  const score = Math.round((completed / total) * 70 + (reviewed / total) * 30);
  const level = score >= 85 ? "جاهز بدرجة ممتازة" : score >= 70 ? "جاهز غالبًا" : score >= 45 ? "تحتاج مراجعة مركزة" : "ابدأ بخطة مراجعة";
  return { score, level, completed, reviewed, weakLessons: items.filter(item => item.status !== "completed" || !item.lastReviewedAt) };
}

async function scopedExamLessons(db: any, userId: number, examId: number): Promise<(ExamLessonInput & { id: number })[]> {
  const rows = await db.select({
    id: lessons.id,
    title: lessons.title,
    chapterTitle: chapters.title,
    subjectTitle: subjects.title,
    progress: lessonProgress.progress,
    status: lessonProgress.status,
    lastReviewedAt: lessonProgress.lastReviewedAt,
  }).from(examLessons)
    .innerJoin(lessons, eq(examLessons.lessonId, lessons.id))
    .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
    .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)))
    .where(and(eq(examLessons.examId, examId), eq(subjects.userId, userId)));
  return rows.map((row: any) => ({ id: row.id, title: row.title, chapterTitle: row.chapterTitle, subjectTitle: row.subjectTitle, progress: Number(row.progress ?? 0), status: row.status ?? "not_started", lastReviewedAt: row.lastReviewedAt ?? null }));
}

export async function createExam(userId: number, input: { title: string; subjectId?: number; chapterId?: number; lessonId?: number; scheduledAt?: Date; lessonIds?: number[] }) {
  const db = await database(); const cycle = await getActiveCycle(userId); const lessonIds = Array.from(new Set([...(input.lessonIds ?? []), ...(input.lessonId ? [input.lessonId] : [])]));
  if (lessonIds.length) {
    const owned = await db.select({ id: lessons.id }).from(lessons).innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(inArray(lessons.id, lessonIds), eq(subjects.userId, userId), isNull(lessons.deletedAt)));
    if (owned.length !== lessonIds.length) throw new Error("اختر دروسًا موجودة ضمن خطتك فقط.");
  }
  await db.insert(exams).values({ userId, cycleId: cycle.id, title: input.title, subjectId: input.subjectId ?? null, chapterId: input.chapterId ?? null, lessonId: input.lessonId ?? null, scheduledAt: input.scheduledAt ?? null });
  const created = await db.select().from(exams).where(and(eq(exams.userId, userId), eq(exams.title, input.title))).orderBy(desc(exams.id)).limit(1);
  if (created[0] && lessonIds.length) await db.insert(examLessons).values(lessonIds.map(lessonId => ({ examId: created[0].id, lessonId })));
  return created[0];
}

export async function updateExam(userId: number, input: { examId: number; title: string; scheduledAt?: Date | null; lessonIds?: number[] }) {
  const db = await database();
  return db.transaction(async tx => {
    const owned = and(eq(exams.id, input.examId), eq(exams.userId, userId));
    const [exam] = await tx.select({ id: exams.id }).from(exams).where(owned).for("update");
    if (!exam) throw new Error("الامتحان غير موجود.");
    const lessonIds = input.lessonIds === undefined ? undefined : [...new Set(input.lessonIds)];
    if (lessonIds?.length) {
      const valid = await tx.select({ id: lessons.id }).from(lessons)
        .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
        .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
        .where(and(eq(subjects.userId, userId), isNull(lessons.deletedAt), inArray(lessons.id, lessonIds)));
      if (valid.length !== lessonIds.length) throw new Error("اختر دروسًا موجودة ضمن خطتك فقط.");
    }
    await tx.update(exams).set({ title: input.title, scheduledAt: input.scheduledAt, ...(lessonIds === undefined ? {} : { lessonId: null, chapterId: null, subjectId: null }) }).where(owned);
    if (lessonIds !== undefined) {
      await tx.delete(examLessons).where(eq(examLessons.examId, input.examId));
      if (lessonIds.length) await tx.insert(examLessons).values(lessonIds.map(lessonId => ({ examId: input.examId, lessonId })));
    }
    return { success: true };
  });
}

export async function setExamArchived(userId: number, examId: number, archived: boolean) {
  const db = await database();
  const [result] = await db.update(exams).set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(exams.userId, userId), eq(exams.id, examId)));
  if (!result.affectedRows) throw new Error("الامتحان غير موجود.");
  return { success: true };
}

export async function listExams(userId: number) {
  const db = await database();
  const [rows, attempts] = await Promise.all([
    db.select({ exam: exams, subject: subjects.title }).from(exams)
      .leftJoin(subjects, eq(exams.subjectId, subjects.id))
      .where(eq(exams.userId, userId)).orderBy(exams.scheduledAt),
    db.select({ id: examAttempts.id, examId: examAttempts.examId, score: examAttempts.score, comprehension: examAttempts.comprehensionScore, date: examAttempts.createdAt })
      .from(examAttempts).where(eq(examAttempts.userId, userId)).orderBy(desc(examAttempts.createdAt), desc(examAttempts.id)),
  ]);
  const attemptsByExam = new Map<number, typeof attempts>();
  for (const attempt of attempts) {
    const history = attemptsByExam.get(attempt.examId) ?? [];
    history.push(attempt);
    attemptsByExam.set(attempt.examId, history);
  }
  return Promise.all(rows.map(async row => {
    const scoped = await scopedExamLessons(db, userId, row.exam.id);
    return { ...row, lessons: scoped, readiness: readinessForLessons(scoped), attempts: attemptsByExam.get(row.exam.id) ?? [] };
  }));
}

export async function analytics(userId: number) {
  const db = await database(); const cycle = await getActiveCycle(userId); const metrics = await metricSnapshot(db, userId); const coins = await getCoinSummary(db, userId);
  const eventDay = sql<string>`date(\`studyEvents\`.\`occurredAt\`)`;
  const subjectName = sql<string>`coalesce(${subjects.title}, 'بدون مادة')`;
  const [daily, bySubject, completion, comprehension, purchases] = await Promise.all([
    db.select({ day: eventDay, minutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)`, events: count() }).from(studyEvents).where(eq(studyEvents.userId, userId)).groupBy(eventDay).orderBy(eventDay),
    db.select({ subject: subjectName, minutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)` }).from(studyEvents).leftJoin(subjects, eq(studyEvents.subjectId, subjects.id)).where(eq(studyEvents.userId, userId)).groupBy(studyEvents.subjectId, subjectName),
    db.select({ open: sql<number>`coalesce(sum(case when ${tasks.status} = 'open' then 1 else 0 end), 0)`, completed: sql<number>`coalesce(sum(case when ${tasks.status} = 'completed' then 1 else 0 end), 0)` }).from(tasks).where(eq(tasks.userId, userId)),
    db.select({ date: sql<string>`date(${examAttempts.createdAt})`, score: examAttempts.score, comprehension: examAttempts.comprehensionScore }).from(examAttempts).where(eq(examAttempts.userId, userId)).orderBy(examAttempts.createdAt),
    db.select({ value: count() }).from(rewardPurchases).where(eq(rewardPurchases.userId, userId)),
  ]);
  return { cycle, metrics, coins, daily, bySubject, completion: completion[0] ?? { open: 0, completed: 0 }, comprehension, rewardsPurchased: Number(purchases[0]?.value ?? 0) };
}

export async function listFlashcardDecks(userId: number) {
  const db = await database(); const cycle = await getActiveCycle(userId);
  const decks = await db.select().from(flashcardDecks).where(eq(flashcardDecks.userId, userId)).orderBy(desc(flashcardDecks.updatedAt));
  return Promise.all(decks.map(async deck => {
    const cards = await db.select().from(flashcards).where(eq(flashcards.deckId, deck.id)).orderBy(desc(flashcards.updatedAt));
    return { ...deck, cards, stats: { total: cards.length, new: cards.filter(card => card.state === "new").length, learning: cards.filter(card => card.state === "learning").length, mastered: cards.filter(card => card.state === "mastered").length } };
  }));
}

export async function createFlashcardDeck(userId: number, input: { title: string; description?: string; color?: string }) {
  const db = await database(); const cycle = await getActiveCycle(userId);
  await db.insert(flashcardDecks).values({ userId, cycleId: cycle.id, title: input.title, description: input.description ?? null, color: input.color ?? "#8B5CF6" });
}

async function ownedFlashcardDeck(db: any, userId: number, deckId: number) {
  const rows = await db.select({ id: flashcardDecks.id }).from(flashcardDecks).where(and(eq(flashcardDecks.id, deckId), eq(flashcardDecks.userId, userId))).limit(1);
  if (!rows[0]) throw new Error("مجموعة الفلاش كارد غير موجودة."); return rows[0];
}

export async function createFlashcard(userId: number, input: { deckId: number; prompt: string; answer: string }) {
  const db = await database(); await ownedFlashcardDeck(db, userId, input.deckId);
  await db.insert(flashcards).values({ deckId: input.deckId, prompt: input.prompt, answer: input.answer });
}

export async function reviewFlashcard(userId: number, cardId: number, result: "again" | "good" | "mastered") {
  const db = await database(); const card = await db.select({ id: flashcards.id }).from(flashcards).innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id)).where(and(eq(flashcards.id, cardId), eq(flashcardDecks.userId, userId))).limit(1);
  if (!card[0]) throw new Error("الفلاش كارد غير موجود.");
  const now = new Date(); const state = result === "mastered" ? "mastered" : result === "good" ? "learning" : "new"; const days = result === "mastered" ? 7 : result === "good" ? 2 : 1;
  await db.update(flashcards).set({ state, lastReviewedAt: now, nextReviewAt: new Date(now.getTime() + days * DAY_MS) }).where(eq(flashcards.id, cardId));
}

export async function deleteFlashcard(userId: number, cardId: number) {
  const db = await database(); const card = await db.select({ id: flashcards.id }).from(flashcards).innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id)).where(and(eq(flashcards.id, cardId), eq(flashcardDecks.userId, userId))).limit(1); if (!card[0]) throw new Error("الفلاش كارد غير موجود."); return db.delete(flashcards).where(eq(flashcards.id, cardId));
}

export async function searchStudyWorkspace(userId: number, query: string) {
  const db = await database(); const pattern = `%${query.trim()}%`;
  const [noteRows, lessonRows, cardRows] = await Promise.all([
    db.select({ id: notes.id, title: notes.title, excerpt: notes.content, notebook: notebooks.title }).from(notes).innerJoin(notebooks, eq(notes.notebookId, notebooks.id)).where(and(eq(notebooks.userId, userId), or(like(notes.title, pattern), like(notes.content, pattern)))).limit(20),
    db.select({ id: lessons.id, title: lessons.title, excerpt: lessons.description, subject: subjects.title, chapter: chapters.title }).from(lessons).innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(eq(subjects.userId, userId), isNull(lessons.deletedAt), or(like(lessons.title, pattern), like(lessons.description, pattern), like(lessons.notes, pattern)))).limit(20),
    db.select({ id: flashcards.id, prompt: flashcards.prompt, answer: flashcards.answer, deck: flashcardDecks.title }).from(flashcards).innerJoin(flashcardDecks, eq(flashcards.deckId, flashcardDecks.id)).where(and(eq(flashcardDecks.userId, userId), or(like(flashcards.prompt, pattern), like(flashcards.answer, pattern)))).limit(20),
  ]);
  return { notes: noteRows, lessons: lessonRows, flashcards: cardRows };
}

const SOURCE_TEXT_LIMIT = 55_000;
async function ownedNotebook(db: any, userId: number, notebookId: number) {
  const owner = await db.select({ id: notebooks.id, title: notebooks.title }).from(notebooks).where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId))).limit(1);
  if (!owner[0]) throw new Error("دفتر الملاحظات غير موجود."); return owner[0];
}

export async function listNotebooks(userId: number) { const db = await database(); return db.select({ notebook: notebooks, noteCount: count(notes.id) }).from(notebooks).leftJoin(notes, eq(notes.notebookId, notebooks.id)).where(eq(notebooks.userId, userId)).groupBy(notebooks.id).orderBy(desc(notebooks.updatedAt)); }
export async function createNotebook(userId: number, title: string) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(notebooks).values({ userId, cycleId: cycle.id, title }); }
export async function listNotes(userId: number, notebookId: number) { const db = await database(); await ownedNotebook(db, userId, notebookId); return db.select().from(notes).where(eq(notes.notebookId, notebookId)).orderBy(desc(notes.updatedAt)); }
export async function createNote(userId: number, input: { notebookId: number; title: string; content: string }) { const db = await database(); await ownedNotebook(db, userId, input.notebookId); await db.insert(notes).values(input); }

export async function listNotebookSources(userId: number, notebookId: number) { const db = await database(); await ownedNotebook(db, userId, notebookId); return db.select({ id: notebookSources.id, fileName: notebookSources.fileName, mimeType: notebookSources.mimeType, storageUrl: notebookSources.storageUrl, characterCount: notebookSources.characterCount, isTruncated: notebookSources.isTruncated, createdAt: notebookSources.createdAt }).from(notebookSources).where(eq(notebookSources.notebookId, notebookId)).orderBy(desc(notebookSources.createdAt)); }

export async function uploadNotebookSource(userId: number, input: { notebookId: number; fileName: string; mimeType: "text/plain" | "text/markdown" | "application/pdf"; contentBase64: string }) {
  const db = await database(); await ownedNotebook(db, userId, input.notebookId);
  const data = Buffer.from(input.contentBase64, "base64"); if (!data.length || data.length > 5 * 1024 * 1024) throw new Error("ارفع ملفًا صالحًا حتى 5 ميجابايت.");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, "_").slice(0, 180) || "source";
  const { key, url } = await storagePut(`notebook-sources/${userId}/${input.notebookId}/${safeName}`, data, input.mimeType);
  const rawText = input.mimeType === "application/pdf" ? "" : data.toString("utf8"); const extractedText = rawText.slice(0, SOURCE_TEXT_LIMIT); const isTruncated = rawText.length > SOURCE_TEXT_LIMIT;
  await db.insert(notebookSources).values({ notebookId: input.notebookId, fileName: safeName, mimeType: input.mimeType, storageKey: key, storageUrl: url, extractedText: extractedText || null, characterCount: rawText.length, isTruncated });
}

export function notebookGroundingInstruction() { return "أنت Notebook AI مخصص للمذاكرة. استخدم حصريًا النصوص والملفات المرفقة في هذه المحادثة. لا تستخدم معلومات خارجية أو معرفة عامة. إذا لم تجد الإجابة في المصادر، قل حرفيًا: \"المعلومة دي مش موجودة في الملفات المرفوعة.\" اذكر اسم الملف أو الملاحظة التي استندت إليها في نهاية كل إجابة. اكتب بالعربية المصرية الواضحة."; }

type NotebookQuiz = { sourceNames: string[]; questions: { question: string; answer: string; choices?: string[] }[] };

export function parseNotebookQuiz(content: unknown): Omit<NotebookQuiz, "sourceNames"> {
  const parsed = typeof content === "string" ? JSON.parse(content) : content;
  const questions = (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length !== 8) throw new Error("تعذر إنشاء امتحان صالح من الملفات. جرّب مرة أخرى.");
  const normalized = questions.map((entry: unknown) => {
    const item = entry as { question?: unknown; answer?: unknown; choices?: unknown };
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    const choices = Array.isArray(item.choices) ? item.choices.filter((choice): choice is string => typeof choice === "string" && choice.trim().length > 0).map(choice => choice.trim()).slice(0, 4) : undefined;
    if (!question || !answer) throw new Error("تعذر إنشاء امتحان صالح من الملفات. جرّب مرة أخرى.");
    return { question, answer, ...(choices?.length ? { choices } : {}) };
  });
  return { questions: normalized };
}

export async function saveNotebookQuiz(userId: number, input: { notebookId: number; quiz: NotebookQuiz }) {
  const db = await database();
  const [owner, cycle] = await Promise.all([ownedNotebook(db, userId, input.notebookId), getActiveCycle(userId)]);
  const title = `اختبار Notebook AI — ${owner.title}`.slice(0, 200);
  await db.insert(exams).values({ userId, cycleId: cycle.id, title, origin: "notebook_ai", notebookId: input.notebookId, quizPayload: input.quiz, subjectId: null, chapterId: null, lessonId: null, scheduledAt: null });
  const [exam] = await db.select().from(exams).where(and(eq(exams.userId, userId), eq(exams.notebookId, input.notebookId), eq(exams.origin, "notebook_ai"))).orderBy(desc(exams.id)).limit(1);
  return exam;
}

export async function createNotebookQuiz(userId: number, notebookId: number) {
  const db = await database();
  await ownedNotebook(db, userId, notebookId);
  const sources = await db.select().from(notebookSources).where(eq(notebookSources.notebookId, notebookId)).orderBy(desc(notebookSources.createdAt)).limit(12);
  if (!sources.length) throw new Error("ارفع ملف PDF أو TXT أو Markdown واحدًا على الأقل قبل إنشاء الامتحان.");
  const sourceNames = sources.map(source => source.fileName);
  const textSources = sources.filter(source => source.extractedText).map(source => `[ملف: ${source.fileName}]\n${source.extractedText}`).join("\n\n");
  const content: any[] = [{ type: "text", text: `أنشئ اختبار مراجعة من 8 أسئلة متدرجة من المصادر التالية فقط. يجب أن تكون الإجابات دقيقة وموجودة في المصادر، ولا تضف معلومات من خارجها.\n\n${textSources || "لا توجد نصوص مستخرجة؛ راجع ملفات PDF المرفقة فقط."}` }];
  for (const source of sources.filter(source => source.mimeType === "application/pdf")) content.push({ type: "file_url", file_url: { url: await storageGetSignedUrl(source.storageKey), mime_type: "application/pdf" } });
  const response = await invokeLLM({
    messages: [{ role: "system", content: notebookGroundingInstruction() }, { role: "user", content }],
    response_format: { type: "json_schema", json_schema: { name: "notebook_quiz", strict: true, schema: { type: "object", properties: { questions: { type: "array", minItems: 8, maxItems: 8, items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, choices: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["question", "answer"], additionalProperties: false } } }, required: ["questions"], additionalProperties: false } } },
  });
  const quiz = { sourceNames, ...parseNotebookQuiz(response.choices[0]?.message?.content) };
  const exam = await saveNotebookQuiz(userId, { notebookId, quiz });
  return { exam, quiz };
}

export async function markNotebookQuizReviewed(userId: number, examId: number) {
  const db = await database();
  const [exam] = await db.select({ id: exams.id }).from(exams).where(and(eq(exams.id, examId), eq(exams.userId, userId), eq(exams.origin, "notebook_ai"))).limit(1);
  if (!exam) throw new Error("امتحان Notebook AI غير موجود.");
  await db.update(exams).set({ quizReviewedAt: new Date() }).where(eq(exams.id, examId));
  return { reviewedAt: new Date() };
}

export async function notebookAI(userId: number, input: { notebookId: number; mode: "question" | "summary" | "quiz" | "explain"; prompt?: string }) {
  const db = await database(); const owner = await ownedNotebook(db, userId, input.notebookId);
  const [items, sources] = await Promise.all([db.select({ title: notes.title, content: notes.content }).from(notes).where(eq(notes.notebookId, input.notebookId)).limit(30), db.select().from(notebookSources).where(eq(notebookSources.notebookId, input.notebookId)).orderBy(desc(notebookSources.createdAt)).limit(12)]);
  if (!items.length && !sources.length) throw new Error("ارفع ملف PDF أو TXT أو Markdown واحدًا على الأقل قبل استخدام Notebook AI.");
  const instruction = input.mode === "summary" ? "لخّص المصادر في نقاط منظمة مع عناوين." : input.mode === "quiz" ? "أنشئ اختبار مراجعة من 8 أسئلة متدرجة، مع الإجابات في قسم منفصل. كل سؤال يجب أن يستند إلى المصادر." : input.mode === "explain" ? "اشرح الفكرة المطلوبة بشكل مبسط باستخدام ما ورد في المصادر فقط." : `أجب عن سؤال الطالب: ${input.prompt ?? ""}`;
  const textSources = [items.map(note => `[ملاحظة: ${note.title}]\n${note.content}`).join("\n\n"), sources.filter(source => source.extractedText).map(source => `[ملف: ${source.fileName}]\n${source.extractedText}`).join("\n\n")].filter(Boolean).join("\n\n");
  const content: any[] = [{ type: "text", text: `${instruction}\n\nالمصادر النصية المتاحة:\n${textSources || "لا توجد مصادر نصية؛ راجع ملفات PDF المرفقة فقط."}` }];
  for (const source of sources.filter(source => source.mimeType === "application/pdf")) content.push({ type: "file_url", file_url: { url: await storageGetSignedUrl(source.storageKey), mime_type: "application/pdf" } });
  const response = await invokeLLM({ messages: [{ role: "system", content: notebookGroundingInstruction() }, { role: "user", content }] });
  return response.choices[0]?.message?.content ?? "تعذر إنشاء نتيجة الآن.";
}

export async function chatWithAssistant(userId: number, messages: { role: "user" | "assistant"; content: string }[]) {
  const db = await database(); const metrics = await metricSnapshot(db, userId);
  const response = await invokeLLM({ messages: [{ role: "system", content: `أنت صاحب مذاكرة مصري مشجع. ساعد الطالب بخطوات عملية قصيرة. هذه بياناته الحالية: ${JSON.stringify(metrics)}` }, ...messages] });
  return response.choices[0]?.message?.content ?? "مش قادر أرد دلوقتي، جرّب تاني.";
}

// Subject metrics use the same saved activity, curriculum, and exam results as the rest of the site.
export async function subjectAnalytics(userId: number) {
  const db = await database();
  const [plan, events, attempts, links] = await Promise.all([
    listStudyPlan(userId),
    db.select({
      subjectId: studyEvents.subjectId, kind: studyEvents.eventType, minutes: studyEvents.durationMinutes,
      date: studyEvents.occurredAt, reason: coinTransactions.reason,
    }).from(studyEvents).leftJoin(coinTransactions, and(eq(coinTransactions.userId, userId), eq(coinTransactions.referenceKey, studyEvents.referenceId)))
      .where(eq(studyEvents.userId, userId)).orderBy(studyEvents.occurredAt),
    db.select({ examId: examAttempts.examId, subjectId: exams.subjectId, score: examAttempts.score, comprehension: examAttempts.comprehensionScore,
      attemptId: examAttempts.id, examTitle: exams.title, date: examAttempts.createdAt, missed: examAttempts.missedTopics })
      .from(examAttempts).innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(and(eq(examAttempts.userId, userId), eq(exams.userId, userId)))
      .orderBy(desc(examAttempts.createdAt), desc(examAttempts.id)),
    db.select({ examId: examLessons.examId, subjectId: subjects.id }).from(examLessons)
      .innerJoin(exams, eq(examLessons.examId, exams.id)).innerJoin(lessons, eq(examLessons.lessonId, lessons.id))
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id))
      .where(and(eq(exams.userId, userId), eq(subjects.userId, userId))),
  ]);
  function row(id: number | null, title: string) {
    return { id, title, chapters: 0, lessons: 0, completed: 0, trackedMinutes: 0, allocatedMinutes: 0, focusSessions: 0, reviews: 0, attempts: 0, scoreTotal: 0, comprehensionTotal: 0, bestScore: null as number | null, activeDays: new Set<string>(), chapterIds: new Set<number>(), lessonIds: new Set<number>(),
      mistakes: new Map<string, { topic: string; count: number }>(),
      recentAttempts: [] as { id: number; exam: string; score: number; date: string }[] };
  }
  const subjectsById = new Map<number, ReturnType<typeof row>>();
  const unassigned = row(null, "بدون مادة");
  for (const item of plan.rows) {
    const stats = subjectsById.get(item.subject.id) ?? row(item.subject.id, item.subject.title);
    subjectsById.set(item.subject.id, stats);
    if (item.chapter) stats.chapterIds.add(item.chapter.id);
    if (item.lesson && !stats.lessonIds.has(item.lesson.id)) {
      stats.lessonIds.add(item.lesson.id);
      if (item.progress?.status === "completed") stats.completed++;
    }
  }
  const cairo = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const event of events) {
    const stats = (event.subjectId === null ? null : subjectsById.get(event.subjectId)) ?? unassigned;
    const allocated = event.kind === "pomodoro_complete" && Boolean(event.reason?.startsWith("Pomodoro — تسجيل مذاكرة سابقة (") || event.reason?.startsWith("Pomodoro — تسجيل يدوي")) && stats.id !== null;
    if (allocated) stats.allocatedMinutes += Number(event.minutes);
    else stats.trackedMinutes += Number(event.minutes);
    if (event.kind === "pomodoro_complete") stats.focusSessions++;
    if (event.kind === "lesson_review") stats.reviews++;
    stats.activeDays.add(cairo.format(event.date));
  }
  const examSubjects = new Map<number, Set<number>>();
  for (const link of links) {
    const set = examSubjects.get(link.examId) ?? new Set<number>();
    set.add(link.subjectId);
    examSubjects.set(link.examId, set);
  }
  for (const attempt of attempts) {
    const linked = examSubjects.get(attempt.examId);
    const id = linked?.size === 1 ? [...linked][0] : linked?.size ? null : attempt.subjectId;
    const stats = (id === null ? null : subjectsById.get(id)) ?? unassigned;
    stats.attempts++;
    if (stats.recentAttempts.length < 10) stats.recentAttempts.push({
      id: attempt.attemptId, exam: attempt.examTitle, score: Number(attempt.score), date: cairo.format(attempt.date),
    });
    const seenTopics = new Set<string>();
    for (const label of Array.isArray(attempt.missed) ? attempt.missed : []) {
      if (typeof label !== "string") continue;
      const topic = label.trim().replace(/\s+/g, " ");
      const key = topic.toLocaleLowerCase("ar-EG");
      if (!key || seenTopics.has(key)) continue;
      seenTopics.add(key);
      const previous = stats.mistakes.get(key);
      stats.mistakes.set(key, { topic: previous?.topic ?? topic, count: (previous?.count ?? 0) + 1 });
    }
    stats.scoreTotal += Number(attempt.score);
    stats.comprehensionTotal += Number(attempt.comprehension);
    stats.bestScore = Math.max(stats.bestScore ?? 0, Number(attempt.score));
  }
  return [...subjectsById.values(), unassigned].map(stats => ({
    id: stats.id, title: stats.title, chapters: stats.chapterIds.size, lessons: stats.lessonIds.size, completed: stats.completed,
    minutes: stats.trackedMinutes + stats.allocatedMinutes, trackedMinutes: stats.trackedMinutes, allocatedMinutes: stats.allocatedMinutes,
    focusSessions: stats.focusSessions, reviews: stats.reviews, activeDays: stats.activeDays.size, attempts: stats.attempts,
    averageScore: stats.attempts ? Math.round(stats.scoreTotal * 10 / stats.attempts) / 10 : null,
    averageComprehension: stats.attempts ? Math.round(stats.comprehensionTotal * 10 / stats.attempts) / 10 : null,
    bestScore: stats.bestScore,
    recentAttempts: stats.recentAttempts,
    missedTopics: [...stats.mistakes.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "ar-EG")).slice(0, 12),
  }));
}


export async function exportStudyBackup(userId: number, includeCatalog: boolean) {
  const db = await database();
  return db.transaction(async tx => {
    const ownedSubjects = tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.userId, userId));
    const ownedChapters = tx.select({ id: chapters.id }).from(chapters).where(inArray(chapters.subjectId, ownedSubjects));
    const records = {
      studyCycles: await tx.select().from(studyCycles).where(eq(studyCycles.userId, userId)),
      subjects: await tx.select().from(subjects).where(eq(subjects.userId, userId)),
      lessonProgress: await tx.select().from(lessonProgress).where(eq(lessonProgress.userId, userId)),
      tasks: await tx.select().from(tasks).where(eq(tasks.userId, userId)),
      assistantChats: await tx.select().from(assistantChats).where(eq(assistantChats.userId, userId)),
      assistantMessages: await tx.select().from(assistantMessages).where(eq(assistantMessages.userId, userId)),
      dailyStudySummaries: await tx.select().from(dailyStudySummaries).where(eq(dailyStudySummaries.userId, userId)),
      habits: await tx.select().from(habits).where(eq(habits.userId, userId)),
      habitCompletions: await tx.select().from(habitCompletions).where(eq(habitCompletions.userId, userId)),
      goals: await tx.select().from(goals).where(eq(goals.userId, userId)),
      pomodoroSessions: await tx.select().from(pomodoroSessions).where(eq(pomodoroSessions.userId, userId)),
      studyVideoSessions: await tx.select().from(studyVideoSessions).where(eq(studyVideoSessions.userId, userId)),
      videoNotes: await tx.select().from(videoNotes).where(eq(videoNotes.userId, userId)),
      exams: await tx.select().from(exams).where(eq(exams.userId, userId)),
      examAttempts: await tx.select().from(examAttempts).where(eq(examAttempts.userId, userId)),
      notebooks: await tx.select().from(notebooks).where(eq(notebooks.userId, userId)),
      flashcardDecks: await tx.select().from(flashcardDecks).where(eq(flashcardDecks.userId, userId)),
      calendarEvents: await tx.select().from(calendarEvents).where(eq(calendarEvents.userId, userId)),
      studyPlanner: await tx.select().from(studyPlanner).where(eq(studyPlanner.id, userId)),
      lessonSources: await tx.select().from(lessonSources).where(eq(lessonSources.userId, userId)),
      rewardPurchases: await tx.select().from(rewardPurchases).where(eq(rewardPurchases.userId, userId)),
      userAchievements: await tx.select().from(userAchievements).where(eq(userAchievements.userId, userId)),
      coinTransactions: await tx.select().from(coinTransactions).where(eq(coinTransactions.userId, userId)),
      studyEvents: await tx.select().from(studyEvents).where(eq(studyEvents.userId, userId)),
      chapters: await tx.select().from(chapters).where(inArray(chapters.subjectId, ownedSubjects)),
      lessons: await tx.select().from(lessons).where(inArray(lessons.chapterId, ownedChapters)),
      goalMilestones: await tx.select().from(goalMilestones).where(inArray(goalMilestones.goalId, tx.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId)))),
      examLessons: await tx.select().from(examLessons).where(inArray(examLessons.examId, tx.select({ id: exams.id }).from(exams).where(eq(exams.userId, userId)))),
      notes: await tx.select().from(notes).where(inArray(notes.notebookId, tx.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.userId, userId)))),
      notebookSources: await tx.select().from(notebookSources).where(inArray(notebookSources.notebookId, tx.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.userId, userId)))),
      flashcards: await tx.select().from(flashcards).where(inArray(flashcards.deckId, tx.select({ id: flashcardDecks.id }).from(flashcardDecks).where(eq(flashcardDecks.userId, userId)))),
      rewards: includeCatalog ? await tx.select().from(rewards) : [],
      coinRateSettings: includeCatalog ? await tx.select().from(coinRateSettings) : [],
    };
    return { format: "seif-study-os", version: 1, exportedAt: new Date().toISOString(), records };
  });
}


export async function searchWorkspaceTitles(userId: number, query: string) {
  const db = await database();
  const pattern = "%" + query.replace(/[!%_]/g, character => "!" + character) + "%";
  const [subjectRows, lessonRows, taskRows, examRows, chatRows] = await Promise.all([
    db.select({ id: subjects.id, title: subjects.title }).from(subjects)
      .where(and(eq(subjects.userId, userId), sql`${subjects.title} LIKE ${pattern} ESCAPE '!'`)).limit(12),
    db.select({ id: lessons.id, title: lessons.title, subject: subjects.title }).from(lessons)
      .innerJoin(chapters, eq(chapters.id, lessons.chapterId)).innerJoin(subjects, eq(subjects.id, chapters.subjectId))
      .where(and(eq(subjects.userId, userId), isNull(lessons.deletedAt), or(sql`${lessons.title} LIKE ${pattern} ESCAPE '!'`, sql`${subjects.title} LIKE ${pattern} ESCAPE '!'`))).limit(12),
    db.select({ id: tasks.id, title: tasks.title, date: tasks.scheduledFor }).from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), sql`${tasks.title} LIKE ${pattern} ESCAPE '!'`)).limit(12),
    db.select({ id: exams.id, title: exams.title, subject: subjects.title }).from(exams)
      .leftJoin(subjects, eq(exams.subjectId, subjects.id))
      .where(and(eq(exams.userId, userId), isNull(exams.archivedAt), or(sql`${exams.title} LIKE ${pattern} ESCAPE '!'`, sql`${subjects.title} LIKE ${pattern} ESCAPE '!'`))).limit(12),
    db.select({ id: assistantChats.id, title: assistantChats.title }).from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNull(assistantChats.deletedAt), sql`${assistantChats.title} LIKE ${pattern} ESCAPE '!'`)).limit(12),
  ]);
  return { subjects: subjectRows, lessons: lessonRows, tasks: taskRows, exams: examRows, chats: chatRows };
}

type ImportRow = { title: string; day?: string; priority: "urgent" | "medium" | "low" };

export async function importStudyCsv(userId: number, kind: "tasks" | "exams", rows: ImportRow[], preview: boolean) {
  const db = await database();
  const cycle = preview ? undefined : await getActiveCycle(userId);
  const dayInCairo = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
    return [part("year"), part("month"), part("day")].join("-");
  };
  const today = dayInCairo(new Date());
  const cairoHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" });
  function noonInCairo(day: string) {
    const utcNoon = new Date(day + "T12:00:00Z");
    return new Date(+utcNoon + (12 - Number(cairoHour.format(utcNoon))) * 3_600_000);
  }
  return db.transaction(async tx => {
    if (!preview) await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const existing = kind === "tasks"
      ? await tx.select({ title: tasks.title, day: tasks.scheduledFor }).from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      : (await tx.select({ title: exams.title, scheduledAt: exams.scheduledAt }).from(exams).where(eq(exams.userId, userId)))
          .map(row => ({ title: row.title, day: row.scheduledAt ? dayInCairo(row.scheduledAt) : null }));
    const key = (title: string, day: string | null) => JSON.stringify([title.trim().toLocaleLowerCase("ar-EG"), day]);
    const seen = new Set(existing.map(row => key(row.title, row.day)));
    const statuses = rows.map(row => {
      const day = row.day ?? (kind === "tasks" ? today : null);
      const fingerprint = key(row.title, day);
      const duplicate = seen.has(fingerprint);
      seen.add(fingerprint);
      return { ...row, day, duplicate };
    });
    const fresh = statuses.filter(row => !row.duplicate);
    if (cycle && fresh.length) {
      if (kind === "tasks") {
        await tx.insert(tasks).values(fresh.map(row => ({
          userId, cycleId: cycle.id, title: row.title, priority: row.priority, scheduledFor: row.day,
        })));
      } else {
        await tx.insert(exams).values(fresh.map(row => ({
          userId, cycleId: cycle.id, title: row.title,
          scheduledAt: row.day ? noonInCairo(row.day) : null,
        })));
      }
    }
    return { rows: statuses, added: cycle ? fresh.length : 0 };
  });
}


export async function listFocusAssignments(userId: number) {
  const db = await database();
  return db.select({
    id: studyEvents.id, subjectId: studyEvents.subjectId, minutes: studyEvents.durationMinutes, date: studyEvents.occurredAt,
  }).from(studyEvents).where(and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "pomodoro_complete")))
    .orderBy(studyEvents.occurredAt, studyEvents.id);
}

export async function assignFocusSubject(userId: number, eventIds: number[], subjectId: number | null) {
  const db = await database();
  const uniqueIds = [...new Set(eventIds)];
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (subjectId !== null) {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects)
        .where(and(eq(subjects.userId, userId), eq(subjects.id, subjectId))).for("update");
      if (!subject) throw new Error("المادة مش موجودة.");
    }
    const selected = and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "pomodoro_complete"), inArray(studyEvents.id, uniqueIds));
    const rows = await tx.select({ id: studyEvents.id, reference: studyEvents.referenceId }).from(studyEvents).where(selected).for("update");
    if (rows.length !== uniqueIds.length) throw new Error("اختار جلسات تركيز موجودة عندك.");
    const sessionIds = rows.flatMap(row => {
      const id = row.reference?.match(/^pomodoro:(\d+):complete$/)?.[1] ?? row.reference?.match(/^offline-focus:[a-f0-9-]{36}:(\d+)$/)?.[1];
      return id ? [Number(id)] : [];
    });
    await tx.update(studyEvents).set({ subjectId }).where(selected);
    if (sessionIds.length) await tx.update(pomodoroSessions).set({ subjectId })
      .where(and(eq(pomodoroSessions.userId, userId), inArray(pomodoroSessions.id, sessionIds)));
    return { updated: rows.length };
  });
}


export async function lessonReviewSchedule(userId: number) {
  const db = await database();
  const rows = await db.select({
    id: lessons.id, title: lessons.title, subject: subjects.title,
    completedAt: lessonProgress.completedAt, reviewedAt: lessonProgress.lastReviewedAt,
  }).from(lessonProgress).innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .innerJoin(subjects, eq(subjects.id, chapters.subjectId))
    .where(and(eq(subjects.userId, userId), eq(lessonProgress.userId, userId), eq(lessonProgress.status, "completed"), isNull(lessons.deletedAt)));
  const cairo = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
  const toDay = (date: Date) => {
    const values = Object.fromEntries(cairo.formatToParts(date).map(part => [part.type, part.value]));
    return [values.year, values.month, values.day].join("-");
  };
  return rows.flatMap(row => {
    const base = row.reviewedAt ?? row.completedAt;
    if (!base) return [];
    const day = new Date(toDay(base) + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() + (row.reviewedAt ? 7 : 3));
    return [{ id: row.id, title: row.title, subject: row.subject, day: day.toISOString().slice(0, 10) }];
  }).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
}


export async function syncOfflineFocus(userId: number, input: {
  key: string; minutes: 15 | 25 | 45 | 60; startedAt: number; completedAt: number;
}) {
  const db = await database();
  if (input.startedAt < Date.UTC(2020, 0, 1) || input.completedAt > Date.now() + 300_000
    || input.completedAt - input.startedAt < input.minutes * 60_000) {
    throw new Error("وقت جلسة الأوفلاين غير صالح. راجع ساعة الجهاز.");
  }

  const cycle = await getActiveCycle(userId);
  const prefix = "offline-focus:" + input.key.toLowerCase() + ":";
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [existing] = await tx.select({ id: studyEvents.id }).from(studyEvents)
      .where(and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "pomodoro_complete"), like(studyEvents.referenceId, prefix + "%")))
      .limit(1);
    if (existing) return { alreadySynced: true, amount: 0 };

    const startedAt = new Date(input.startedAt);
    const completedAt = new Date(input.completedAt);
    const [session] = await tx.insert(pomodoroSessions).values({
      userId, cycleId: cycle.id, startedAt, completedAt, createdAt: startedAt,
      plannedMinutes: input.minutes, completedMinutes: input.minutes, state: "completed",
    });
    const referenceId = prefix + session.insertId;
    await tx.insert(studyEvents).values({
      userId, cycleId: cycle.id, eventType: "pomodoro_complete", referenceId,
      durationMinutes: input.minutes, occurredAt: completedAt,
    });
    const rateKey = ("pomodoro_" + input.minutes) as CoinRateKey;
    const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
      .where(eq(coinRateSettings.rateKey, rateKey)).limit(1);
    const amount = rate?.amount ?? coinRewardForPomodoro(input.minutes);
    if (amount > 0) await tx.insert(coinTransactions).values({
      userId, cycleId: cycle.id, amount, type: "earn", referenceKey: referenceId,
      reason: "Pomodoro بدون نت — " + input.minutes + " دقيقة", createdAt: completedAt,
    });
    return { alreadySynced: false, amount };
  });
  if (!result.alreadySynced) await evaluateAchievements(userId, cycle.id).catch(error => console.warn("Offline focus achievements failed", error instanceof Error ? error.name : "unknown"));
  return result;
}


export async function createRecurringTasks(userId: number, input: {
  title: string; description?: string; category?: string; priority: "urgent" | "medium" | "low";
  startsOn: string; weekdays: number[]; weeks: number;
}) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  const weekdays = new Set(input.weekdays);
  const start = Date.parse(input.startsOn + "T00:00:00Z");
  const days = Array.from({ length: input.weeks * 7 }, (_, index) => new Date(start + index * 86_400_000))
    .filter(day => weekdays.has(day.getUTCDay())).map(day => day.toISOString().slice(0, 10));
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const existing = await tx.select({ day: tasks.scheduledFor }).from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.title, input.title), inArray(tasks.scheduledFor, days)));
    const seen = new Set(existing.map(row => row.day));
    const fresh = days.filter(day => !seen.has(day));
    if (fresh.length) await tx.insert(tasks).values(fresh.map(day => ({
      userId, cycleId: cycle.id, title: input.title, description: input.description ?? null,
      category: input.category ?? "دراسة", priority: input.priority, scheduledFor: day,
    })));
    return { added: fresh.length, skipped: days.length - fresh.length };
  });
}


export async function syncOfflineTask(userId: number, input: { key: string; title: string; day: string }) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const requestKey = input.key.toLowerCase();
    const [existing] = await tx.select().from(offlineTaskWrites)
      .where(and(eq(offlineTaskWrites.userId, userId), eq(offlineTaskWrites.requestKey, requestKey))).limit(1);
    if (existing) {
      const [saved] = await tx.select({ updatedAt: tasks.updatedAt }).from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.id, existing.taskId))).limit(1);
      return { taskId: existing.taskId, alreadySynced: true, updatedAt: saved ? +saved.updatedAt : undefined };
    }
    const [task] = await tx.insert(tasks).values({
      userId, cycleId: cycle.id, title: input.title, scheduledFor: input.day, priority: "medium",
    });
    await tx.insert(offlineTaskWrites).values({ userId, requestKey, taskId: task.insertId });
    const [saved] = await tx.select({ updatedAt: tasks.updatedAt }).from(tasks).where(eq(tasks.id, task.insertId)).limit(1);
    return { taskId: task.insertId, alreadySynced: false, updatedAt: saved ? +saved.updatedAt : undefined };
  });
}


export async function listStudyTrash(userId: number) {
  const db = await database();
  const [taskRows, chatRows, lessonRows] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, deletedAt: tasks.deletedAt }).from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt))).orderBy(desc(tasks.deletedAt)),
    db.select({ id: assistantChats.id, title: assistantChats.title, deletedAt: assistantChats.deletedAt }).from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNotNull(assistantChats.deletedAt))).orderBy(desc(assistantChats.deletedAt)),
    db.select({ id: lessons.id, title: lessons.title, deletedAt: lessons.deletedAt }).from(lessons)
      .innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id))
      .where(and(eq(subjects.userId, userId), isNotNull(lessons.deletedAt))).orderBy(desc(lessons.deletedAt)),
  ]);
  return { tasks: taskRows, chats: chatRows, lessons: lessonRows };
}

export async function restoreStudyTrash(userId: number, kind: "tasks" | "chats" | "lessons", id: number) {
  const db = await database();
  if (kind === "tasks") await db.update(tasks).set({ deletedAt: null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNotNull(tasks.deletedAt)));
  else if (kind === "chats") await db.update(assistantChats).set({ deletedAt: null })
    .where(and(eq(assistantChats.id, id), eq(assistantChats.userId, userId), isNotNull(assistantChats.deletedAt)));
  else {
    const ownedChapters = db.select({ id: chapters.id }).from(chapters).innerJoin(subjects, eq(chapters.subjectId, subjects.id))
      .where(eq(subjects.userId, userId));
    await db.update(lessons).set({ deletedAt: null })
      .where(and(eq(lessons.id, id), inArray(lessons.chapterId, ownedChapters), isNotNull(lessons.deletedAt)));
  }
  return { ok: true };
}


export async function syncOfflineExam(userId: number, input: {
  key: string; examId: number; totalQuestions: number; correctAnswers: number;
  difficulty: "easy" | "medium" | "hard"; missedTopics: string[]; completedAt: Date;
}) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const requestKey = input.key.toLowerCase();
    const [priorWrite] = await tx.select({ attemptId: offlineExamWrites.attemptId }).from(offlineExamWrites)
      .where(and(eq(offlineExamWrites.userId, userId), eq(offlineExamWrites.requestKey, requestKey))).limit(1);
    if (priorWrite) return { alreadySynced: true, attemptId: priorWrite.attemptId, cycleId: null };

    const [exam] = await tx.select().from(exams)
      .where(and(eq(exams.userId, userId), eq(exams.id, input.examId), isNull(exams.archivedAt))).for("update");
    if (!exam) throw new Error("الامتحان مش موجود أو متأرشف.");
    const score = Math.round(input.correctAnswers * 100 / input.totalQuestions);
    const [prior] = await tx.select({ average: sql<number>`coalesce(avg(${examAttempts.score}), 0)` })
      .from(examAttempts).where(eq(examAttempts.userId, userId));
    const comprehensionScore = fallbackComprehension(score, input.difficulty, Number(prior?.average ?? 0));
    const [attempt] = await tx.insert(examAttempts).values({
      userId, cycleId: exam.cycleId, examId: exam.id, score, comprehensionScore,
      totalQuestions: input.totalQuestions, correctAnswers: input.correctAnswers,
      incorrectAnswers: input.totalQuestions - input.correctAnswers, missedTopics: input.missedTopics,
      difficulty: input.difficulty, completionRewarded: true, createdAt: input.completedAt,
    });
    const reference = "examAttempt:" + attempt.insertId;
    await tx.insert(studyEvents).values({
      userId, cycleId: exam.cycleId, eventType: "exam_complete", referenceId: reference, occurredAt: input.completedAt,
    });
    const threshold = [95, 90, 80, 70, 60].find(value => comprehensionScore >= value);
    const payouts: { key: CoinRateKey; amount: number; suffix: string; reason: string }[] = [
      { key: "exam_complete", amount: 15, suffix: "completion", reason: "إكمال امتحان: " + exam.title },
    ];
    if (threshold) payouts.push({
      key: ("exam_bonus_" + threshold) as CoinRateKey, amount: examBonusForComprehension(comprehensionScore),
      suffix: "comprehension", reason: "مكافأة الاستيعاب: " + comprehensionScore + "%",
    });
    for (const payout of payouts) {
      const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
        .where(eq(coinRateSettings.rateKey, payout.key)).limit(1);
      const amount = rate?.amount ?? payout.amount;
      if (amount > 0) await tx.insert(coinTransactions).values({
        userId, cycleId: exam.cycleId, amount, type: "earn", referenceKey: reference + ":" + payout.suffix,
        reason: payout.reason, createdAt: input.completedAt,
      });
    }
    await tx.insert(offlineExamWrites).values({ userId, requestKey, attemptId: attempt.insertId });
    return { alreadySynced: false, attemptId: attempt.insertId, cycleId: exam.cycleId };
  });
  if (result.cycleId !== null) await evaluateAchievements(userId, result.cycleId).catch(() => []);
  return { alreadySynced: result.alreadySynced, attemptId: result.attemptId };
}

export async function getPlanner(userId: number) {
  const db = await database();
  const [row] = await db.select().from(studyPlanner).where(eq(studyPlanner.id, userId));
  return row?.state ?? emptyPlanner;
}

async function changePlanner<T>(userId: number, change: (state: PlannerState, tx: Parameters<Parameters<Awaited<ReturnType<typeof database>>["transaction"]>[0]>[0]) => Promise<T>) {
  const db = await database();
  return db.transaction(async tx => {
    await tx.insert(studyPlanner).values({ id: userId, state: emptyPlanner })
      .onDuplicateKeyUpdate({ set: { id: userId } });
    const [row] = await tx.select().from(studyPlanner).where(eq(studyPlanner.id, userId)).for("update");
    const result = await change(row.state, tx);
    await tx.update(studyPlanner).set({ state: row.state }).where(eq(studyPlanner.id, userId));
    return result;
  });
}

export function savePlannerHours(userId: number, wake: string, sleep: string) {
  return changePlanner(userId, async state => {
    if (wake >= sleep) throw new Error("وقت النوم لازم يبقى بعد وقت الصحوة في نفس اليوم.");
    state.wake = wake;
    state.sleep = sleep;
  });
}

export function savePlannerSlot(userId: number, slot: PlannerSlot, allowOverlap: boolean) {
  return changePlanner(userId, async (state, tx) => {
    if (slot.start >= slot.end) throw new Error("وقت النهاية لازم يبقى بعد البداية.");
    if (overlapsPlannerSlot(slot, state.slots) && !allowOverlap) throw new Error("الموعد ده متداخل مع موعد تاني.");
    if (slot.subjectId) {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects)
        .where(and(eq(subjects.id, slot.subjectId), eq(subjects.userId, userId)));
      if (!subject) throw new Error("المادة مش موجودة.");
    }
    if (slot.sourceId) await ownedLessonSource(tx, userId, slot.sourceId);
    const previous = state.slots.find(item => item.id === slot.id);
    if (previous && previous.subjectId !== slot.subjectId && state.attendance.some(item => item.slotId === slot.id)) {
      throw new Error("الحصة دي ليها سجل حضور. أضف موعد جديد للمادة التانية.");
    }
    if (!previous && state.slots.length >= 100) throw new Error("الجدول فيه ١٠٠ موعد بالفعل.");
    state.slots = [...state.slots.filter(item => item.id !== slot.id), slot];
  });
}

export function removePlannerSlot(userId: number, slotId: string) {
  return changePlanner(userId, async state => {
    state.slots = state.slots.filter(slot => slot.id !== slotId);
  });
}

function cairoPlannerTime(day: string, time: string) {
  const utc = Date.parse(day + "T" + time + ":00Z");
  const zone = new Intl.DateTimeFormat("en", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" })
    .formatToParts(new Date(utc)).find(part => part.type === "timeZoneName")?.value;
  const offset = zone?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "+02:00";
  return new Date(day + "T" + time + ":00" + offset);
}

export async function attendPlannerClass(userId: number, input: { slotId: string; day: string; lessonIds: number[] }) {
  const { cycle, rows } = await listStudyPlan(userId);
  return changePlanner(userId, async (state, tx) => {
    if (state.attendance.some(item => item.slotId === input.slotId && item.day === input.day)) return;
    const slot = state.slots.find(item => item.id === input.slotId);
    if (!slot?.subjectId || plannerWeekday(input.day) !== slot.weekday || input.day > plannerToday()) {
      throw new Error("اختار تاريخ حصة موجودة في الجدول.");
    }
    const subjectRows = rows.filter(row => row.subject.id === slot.subjectId && row.lesson);
    const subject = subjectRows[0]?.subject;
    if (!subject) throw new Error("أضف دروس للمادة في خطة المنهج الأول.");
    const attended = new Set(state.attendance.map(item => item.lessonId));
    const remaining = subjectRows.filter(row => row.progress?.status !== "completed" && !attended.has(row.lesson!.id));
    const policy = plannerPolicy(subject.title);
    const next = policy === "arabic"
      ? input.lessonIds.map(id => remaining.find(row => row.lesson!.id === id)).filter(row => row !== undefined)
      : remaining.slice(0, 1);
    if (!next.length || next.length !== input.lessonIds.length || new Set(input.lessonIds).size !== next.length
      || next.some(row => !input.lessonIds.includes(row.lesson!.id))) {
      throw new Error("الدروس المتبقية اتغيّرت. حدّث الصفحة واختار الدرس من جديد.");
    }

    const nextSlot = Array.from({ length: 8 }, (_, index) => shiftPlannerDay(input.day, index))
      .flatMap(day => state.slots.filter(item => item.subjectId === subject.id && item.weekday === plannerWeekday(day))
        .filter(item => day > input.day || item.start > slot.start)
        .map(item => ({ day, start: item.start })))
      .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start))[0];
    const deadline = nextSlot ? cairoPlannerTime(nextSlot.day, nextSlot.start) : null;
    const homework = policy === "history" ? ["واجب مقالي", "واجب تاريخ", "تلخيص"] : ["واجب"];
    const previousClasses = new Set(state.attendance.filter(item => item.subjectId === subject.id).map(item => item.slotId + item.day)).size;
    if (policy === "arabic") {
      const titles = next.map(row => row.chapter?.title + " · " + row.lesson!.title);
      await tx.insert(tasks).values({
        userId, cycleId: cycle.id, title: ("واجب محاضرة العربي · " + next[0].lesson!.title).slice(0, 200),
        description: titles.join("\n").slice(0, 2000), category: "واجب", scheduledFor: input.day, deadline,
      });
    }
    for (const row of next) {
      const lesson = row.lesson!;
      state.attendance.push({ slotId: slot.id, day: input.day, subjectId: subject.id, lessonId: lesson.id, lessonTitle: lesson.title });
      attended.add(lesson.id);
      if (policy !== "arabic") await tx.insert(tasks).values(homework.map(label => ({
        userId, cycleId: cycle.id, title: (label + " · " + lesson.title).slice(0, 200),
        description: subject.title + " / " + (row.chapter?.title ?? "") + " / " + lesson.title,
        category: "واجب", scheduledFor: input.day, deadline,
      })));
      const unitComplete = subjectRows.every(item => item.chapter?.id !== row.chapter?.id
        || item.progress?.status === "completed" || attended.has(item.lesson!.id));
      if (unitComplete && (policy === "programming" || policy === "english")) {
        addPlannerMilestone(state, "unit-workshop-" + row.chapter!.id, "ورشة " + subject.title + " · " + row.chapter!.title);
        addPlannerMilestone(state, "unit-exam-" + row.chapter!.id, "شامل " + subject.title + " · " + row.chapter!.title);
      }
    }
    const count = previousClasses + 1;
    if (policy === "history" && count % 4 === 0) {
      addPlannerMilestone(state, "history-" + subject.id + "-" + count, "معسكر مراجعة التاريخ");
    }
    if (policy === "arabic" && count % 4 === 0) {
      addPlannerMilestone(state, "arabic-workshop-" + subject.id + "-" + count, "ورشة العربي", 600);
      addPlannerMilestone(state, "arabic-exam-" + subject.id + "-" + count, "امتحان العربي الشامل", undefined, "arabic-workshop-" + subject.id + "-" + count);
    }
  });
}

function addPlannerMilestone(state: PlannerState, id: string, title: string, duration?: number, follows?: string) {
  if (!state.milestones.some(item => item.id === id)) state.milestones.push({ id, title, duration, follows });
}

export async function schedulePlannerMilestone(userId: number, input: { id: string; day: string; start: string; minutes: number }) {
  const cycle = await getActiveCycle(userId);
  return changePlanner(userId, async (state, tx) => {
    const item = state.milestones.find(value => value.id === input.id);
    if (!item) throw new Error("الموعد مش موجود.");
    item.day = input.day;
    item.start = input.start;
    item.minutes = item.duration ?? input.minutes;
    const startsAt = cairoPlannerTime(input.day, input.start);
    const endsAt = new Date(startsAt.getTime() + (item.duration ?? input.minutes) * 60_000);
    if (item.eventId) {
      await tx.update(calendarEvents).set({ startsAt, endsAt }).where(and(eq(calendarEvents.id, item.eventId), eq(calendarEvents.userId, userId)));
    } else {
      const [result] = await tx.insert(calendarEvents).values({ userId, cycleId: cycle.id, title: item.title.slice(0, 200), startsAt, endsAt });
      item.eventId = result.insertId;
    }
  });
}
