import { studyOverlapByDay, totalStudyMinutes } from "../shared/studyTime.js";
import { addBreakTime } from "../shared/studyBreak.js";
import { externalVideoDeadline, externalVideoElapsed, videoBlockSeconds } from "../shared/videoTimer.js";
import { studyEfforts, type StudyEffort, type StudyItem, type WeeklyStudy } from "../shared/weeklyStudy.js";
import { sleepDuration, sleepTargetMinutes, type SleepLog } from "../shared/sleep.js";
import { cairoPlannerTime, examClock, examLocalDate, examOccurrences, type ExamScheduleOptions } from "../shared/examSchedule.js";
import { buildYearReviews, emptyResources, yearReviewDate, type StudyResourceChange } from "../shared/studyResources.js";
import { nawafil, prayerLoggingEnd } from "../shared/nawafil.js";
import { defaultDesktopTabs, type NavigationPrefs } from "../shared/navigation.js";
import { assessmentCatalog, type AssessmentStatus } from "../shared/assessments.js";
import { cairoPrayers, prayers, prayerNames, type Prayer } from "./prayerTimes.js";
import { focusReward, isFocusPreset } from "../shared/focusDuration.js";
import { slotOccurs, upcomingClassLessons } from "../shared/studyPlanner.js";
import { plannerMinutes, plannerFreeTime, studySlots, type PlannedStudy } from "../shared/studyPlanner.js";
import { emptyPlanner, overlapsPlannerSlot, plannerPolicy, plannerToday, plannerWeekday, shiftPlannerDay, type PlannerSlot, type PlannerState } from "../shared/studyPlanner.js";
import { studyPlanner } from "../drizzle/schema.js";
import { coinRateCatalog, coinRateKeys, type CoinRateKey } from "../shared/coinRates.js";
import { and, count, desc, eq, exists, gte, inArray, isNotNull, isNull, like, lt, lte, notExists, notInArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  achievements, calendarEvents, chapters, coinTransactions, examAttempts, examLessons, exams, goalMilestones,
  offlineExamWrites, offlineTaskWrites, coinRateSettings, assistantChats, assistantMessages, dailyStudySummaries, goals, habitCompletions, habits, lessonProgress, lessons, flashcardDecks, flashcards, notebooks, notebookSources, notes, pomodoroSessions,
  rewardPurchases, rewards, studyCycles, studyEvents, studyVideoSessions, videoNotes, subjects, tasks, lessonSources,
  userAchievements, users, type InsertUser,
} from "../drizzle/schema.js";
import { hybridHomeworkSources, seifLessonSourceDefaults, videoSubject, type LessonSourceDraft } from "../shared/lessonSources.js";
import { achievementCatalog, rewardCatalog, type AchievementMetric } from "../shared/catalog.js";
import { invokeLLM } from "./_core/llm.js";
import { storageGetSignedUrl, storagePut } from "./storage.js";
import { ENV } from "./_core/env.js";
import { decideCompletion, decideRewardPurchase, deriveFallbackComprehension, selectAchievementUnlocks } from "./businessRules.js";
import { classifyStudySource, safeStudyUrl } from "../client/src/lib/videoSources.js";

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

async function awardPlannerCoins(tx: StudyTransaction, userId: number, cycleId: number,
  rateKey: CoinRateKey, reference: string, reason: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  const referenceKey = `planner:${userId}:${reference}`;
  const [previous] = await tx.select({ id: coinTransactions.id }).from(coinTransactions)
    .where(eq(coinTransactions.referenceKey, referenceKey)).limit(1);
  if (previous) return;
  const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
    .where(eq(coinRateSettings.rateKey, rateKey)).limit(1);
  const amount = rate?.amount ?? coinRateCatalog[rateKey][1];
  if (amount > 0) await tx.insert(coinTransactions).values({ userId, cycleId, amount, type: "earn", reason, referenceKey });
}

async function recordStudyEvent(params: { userId: number; cycleId: number; subjectId?: number | null; eventType: typeof studyEvents.$inferInsert.eventType; referenceId: string; durationMinutes?: number }) {
  const db = await database();
  const exists = await db.select({ id: studyEvents.id }).from(studyEvents).where(and(eq(studyEvents.userId, params.userId), eq(studyEvents.referenceId, params.referenceId))).limit(1);
  if (exists[0]) return false;
  await db.insert(studyEvents).values({ ...params, durationMinutes: params.durationMinutes ?? 0 });
  return true;
}

type StudyReader = Pick<Awaited<ReturnType<typeof database>>, "select">;

function studyTimeRows(db: StudyReader, userId: number) {
  return db.select({ id: studyEvents.id, at: studyEvents.occurredAt, reference: studyEvents.referenceId,
    kind: studyEvents.eventType, minutes: studyEvents.durationMinutes }).from(studyEvents)
    .where(and(eq(studyEvents.userId, userId), sql`${studyEvents.durationMinutes} > 0`));
}

export function setStudyTotalBaseline(userId: number, minutes: number) {
  return changePlanner(userId, async (planner, tx) => {
    if (planner.studyTotalBaseline) return planner.studyTotalBaseline;
    const [last] = await tx.select({ id: studyEvents.id }).from(studyEvents)
      .where(eq(studyEvents.userId, userId)).orderBy(desc(studyEvents.id)).limit(1);
    planner.studyTotalBaseline = { minutes, throughEventId: last?.id ?? 0 };
    return planner.studyTotalBaseline;
  });
}

async function metricSnapshot(db: StudyReader, userId: number, timeRows?: Awaited<ReturnType<typeof studyTimeRows>>) {
  const [planner, timed] = await Promise.all([getPlanner(userId), timeRows ?? studyTimeRows(db, userId)]);
  const studyMinutes = totalStudyMinutes(timed, dateKey, planner.studyTotalBaseline);
  const [events] = await db.select({
    lessonsCompleted: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'lesson_complete' then 1 else 0 end), 0)`,
    reviews: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'lesson_review' then 1 else 0 end), 0)`,
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
  const manualVideoMinutes = planner.manualVideoMinutes ?? 0;
  const values = {
    lessonsCompleted: Number(events?.lessonsCompleted ?? 0), reviews: Number(events?.reviews ?? 0), studyMinutes,
    pomodoros: Number(events?.pomodoros ?? 0), tasksCompleted: Number(events?.tasksCompleted ?? 0), urgentTasks: Number(urgent?.value ?? 0),
    goalsCompleted: Number(events?.goalsCompleted ?? 0), habitDays: Number(events?.habitDays ?? 0), videoMinutes: Math.max(0, Number(events?.videoMinutes ?? 0) + manualVideoMinutes + (planner.correctedVideoMinutes ?? 0)), manualVideoMinutes,
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

export async function dailyStudyBrief(userId: number) {
  const now = new Date();
  const day = plannerToday(now);
  const db = await database();
  const end = cairoPlannerTime(shiftPlannerDay(day, 1), "00:00");
  const [planner, pending, examRows, reviews] = await Promise.all([
    getPlanner(userId),
    db.select({ title: tasks.title, category: tasks.category, deadline: tasks.deadline })
      .from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.status, "open"),
        or(eq(tasks.scheduledFor, day), and(eq(tasks.category, "واجب"), lt(tasks.deadline, end)))))
      .orderBy(tasks.deadline, tasks.id),
    scheduledExamRows(db, userId),
    upcomingExamReviews(userId),
  ]);
  const attended = new Set(planner.attendance.filter(item => item.day === day).map(item => item.slotId));
  const classes = planner.slots.filter(slot => slot.subjectId && slotOccurs(slot, day)
    && !attended.has(slot.id) && cairoPlannerTime(day, slot.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start)).map(slot => slot.title);
  const plans = (planner.studySessions ?? []).filter(item => item.day === day && !item.done)
    .sort((a, b) => a.start.localeCompare(b.start)).map(item => item.title);
  const upcoming = examOccurrences(examRows, day, shiftPlannerDay(day, 1), planner.slots);
  const exams = upcoming.filter(exam => plannerToday(exam.scheduledAt) === day && exam.endAt > now).map(exam => exam.title);
  const nextExams = upcoming.filter(exam => plannerToday(exam.scheduledAt) !== day
    && +exam.scheduledAt - +now <= DAY_MS).map(exam => exam.title);
  return {
    day, friday: plannerWeekday(day) === 5, nextExams,
    groups: [
      { label: "حصص", titles: classes },
      { label: "امتحانات", titles: exams },
      { label: "واجبات", titles: pending.filter(task => task.category === "واجب").map(task => task.title) },
      { label: "مهام", titles: pending.filter(task => task.category !== "واجب").map(task => task.title) },
      { label: "مذاكرة", titles: plans },
      { label: "مراجعات", titles: reviews.map(review => review.title) },
    ],
  };
}

export async function dashboard(userId: number) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  const metrics = await metricSnapshot(db, userId);
  const coins = await getCoinSummary(db, userId);
  const today = dateKey();
  const todaysTasks = await db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.scheduledFor, today))).orderBy(desc(tasks.priority));
  const upcomingExams = await upcomingExamOccurrences(userId, 4);
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
    .where(eq(subjects.userId, userId)).orderBy(subjects.createdAt, subjects.id, chapters.sortOrder, chapters.id, lessons.sortOrder, lessons.id);
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
type StudyTransaction = Parameters<Parameters<Awaited<ReturnType<typeof database>>["transaction"]>[0]>[0];

async function completeLessonInTransaction(tx: StudyTransaction, userId: number, lessonId: number, completedAt: Date) {
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
}

export async function completeLesson(userId: number, lessonId: number, completedAt = new Date()) {
  const db = await database();
  const result = await db.transaction(tx => completeLessonInTransaction(tx, userId, lessonId, completedAt));
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
      .where(eq(coinRateSettings.rateKey, item.category === "واجب" ? "homework_complete" : `task_${item.priority}`)).limit(1);
    const amount = prior ? 0 : rate?.amount ?? (item.category === "واجب" ? coinRateCatalog.homework_complete[1] : taskRewardForPriority(item.priority));
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
  const upcoming = await upcomingExamOccurrences(userId, 1);
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
export async function startPomodoro(userId: number, input: { plannedMinutes: number; subjectId?: number; elapsedMinutes?: number }) {
  const db = await database();
  const cycle = await getActiveCycle(userId);
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [active] = await tx.select().from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, userId), inArray(pomodoroSessions.state, ["running", "paused"])))
      .orderBy(desc(pomodoroSessions.id)).limit(1);
    if (active) {
      if (input.elapsedMinutes) throw new Error("فيه بومودورو شغّال. انهيه الأول عشان تسجّل الوقت اللي فات.");
      return active;
    }
    const subjectId = input.subjectId ?? null;
    if (subjectId !== null) {
      const [subject] = await tx.select({ id: subjects.id }).from(subjects)
        .where(and(eq(subjects.userId, userId), eq(subjects.id, subjectId)));
      if (!subject) throw new Error("المادة مش موجودة.");
    }
    await changeStudyBreak(tx, userId, new Date());
    const [result] = await tx.insert(pomodoroSessions).values({ userId, cycleId: cycle.id, plannedMinutes: input.plannedMinutes, subjectId,
      ...(input.elapsedMinutes ? { startedAt: new Date(Date.now() - input.elapsedMinutes * 60_000) } : {}) });
    const [created] = await tx.select().from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.id, result.insertId)));
    return created;
  });
}
export async function completePomodoro(userId: number, sessionId: number, finishEarly = false, breakMinutes?: number) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [session] = await tx.select().from(pomodoroSessions)
      .where(and(eq(pomodoroSessions.id, sessionId), eq(pomodoroSessions.userId, userId))).for("update");
    if (!session) throw new Error("جلسة Pomodoro غير موجودة.");
    if (session.state === "completed") return { alreadyCompleted: true, awarded: false, amount: 0, cycleId: session.cycleId };
    if (session.state !== "running" && !(finishEarly && session.state === "paused")) {
      throw new Error("الجلسة مش متاحة للإكمال.");
    }
    const now = new Date();
    const stopTime = session.state === "paused" ? +(session.pausedAt ?? now) : +now;
    const elapsedMinutes = Math.max(0, Math.floor((stopTime - +session.startedAt - session.pausedSeconds * 1000) / 60_000));
    const minutes = Math.min(session.plannedMinutes, elapsedMinutes);
    if (!finishEarly && minutes < session.plannedMinutes) {
      throw new Error("المكافأة بتنزل بعد اكتمال وقت التركيز.");
    }
    if (minutes === 0) {
      await tx.update(pomodoroSessions).set({ state: "cancelled", pausedAt: null }).where(eq(pomodoroSessions.id, sessionId));
      return { alreadyCompleted: false, awarded: false, amount: 0, cycleId: session.cycleId };
    }
    await tx.update(pomodoroSessions).set({
      state: "completed", completedMinutes: minutes, completedAt: now, pausedAt: null,
    }).where(eq(pomodoroSessions.id, sessionId));
    if (breakMinutes) await changeStudyBreak(tx, userId, now, breakMinutes);
    const reference = `pomodoro:${sessionId}:complete`;
    const key: CoinRateKey = isFocusPreset(session.plannedMinutes) ? `pomodoro_${session.plannedMinutes}` : "pomodoro_60";
    const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings).where(eq(coinRateSettings.rateKey, key));
    const fullReward = focusReward(session.plannedMinutes, rate?.amount ?? coinRateCatalog[key][1]);
    const amount = Math.floor(fullReward * minutes / session.plannedMinutes);
    await tx.insert(studyEvents).values({
      userId, cycleId: session.cycleId, subjectId: session.subjectId, eventType: "pomodoro_complete",
      referenceId: reference, durationMinutes: minutes, occurredAt: now,
    });
    if (amount > 0) await tx.insert(coinTransactions).values({
      userId, cycleId: session.cycleId, amount, type: "earn", referenceKey: reference,
      reason: `Pomodoro مكتمل — ${minutes} دقيقة`,
    });
    return { alreadyCompleted: false, awarded: amount > 0, amount, cycleId: session.cycleId, balance: (await getCoinSummary(tx, userId)).balance };
  });
  const { cycleId, ...completion } = result;
  return { ...completion, unlocks: result.alreadyCompleted ? [] : await evaluateAchievements(userId, cycleId).catch(() => []) };
}

export async function pausePomodoro(userId: number, sessionId: number, paused: boolean) {
  const db = await database();
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(pomodoroSessions.id, sessionId), eq(pomodoroSessions.userId, userId));
    const [session] = await tx.select().from(pomodoroSessions).where(owned).for("update");
    if (!session || !["running", "paused"].includes(session.state)) throw new Error("لا يمكن تعديل هذه الجلسة.");
    const now = new Date();
    if (paused && session.state === "running") {
      return tx.update(pomodoroSessions).set({ state: "paused", pausedAt: now }).where(owned);
    }
    if (!paused && session.state === "paused") {
      await changeStudyBreak(tx, userId, now);
      const pausedSeconds = session.pausedAt ? Math.max(0, Math.floor((+now - +session.pausedAt) / 1000)) : 0;
      return tx.update(pomodoroSessions).set({ state: "running", pausedAt: null, pausedSeconds: session.pausedSeconds + pausedSeconds }).where(owned);
    }
    return { rowsAffected: 0 };
  });
}

export async function startVideoSession(userId: number, input: { videoUrl: string; lessonTitle?: string; subject: "arabic" | "history" | "english" | "programming_ai" | "german" | "other"; requestedMode: "auto" | "embedded" | "external"; local?: boolean }) { const db = await database(); const cycle = await getActiveCycle(userId); const detected = input.local ? "embedded" : classifyStudySource(input.videoUrl); if (detected === "invalid") throw new Error("رابط الدرس غير صالح."); const sourceMode = input.requestedMode === "external" || detected === "external" ? "external" : "embedded"; return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [open] = await tx.select({ id: studyVideoSessions.id }).from(studyVideoSessions).where(and(
      eq(studyVideoSessions.userId, userId), eq(studyVideoSessions.subject, input.subject),
      inArray(studyVideoSessions.phase, ["watching", "break"]),
    )).limit(1);
    if (open) throw new Error("فيه جلسة مفتوحة للمادة دي. كمّلها أو انهيها الأول.");
    const [created] = await tx.insert(studyVideoSessions).values({
      userId, cycleId: cycle.id, videoUrl: input.videoUrl, lessonTitle: input.lessonTitle || null,
      subject: input.subject, sourceMode, manualProgress: "started", timerRunning: false, phase: "watching",
    });
    const [session] = await tx.select().from(studyVideoSessions).where(eq(studyVideoSessions.id, created.insertId));
    return session!;
  });
}
export function correctExternalVideoMinutes(userId: number, sessionId: number, minutes: number) {
  return changePlanner(userId, async (state, tx) => {
    const owned = and(eq(studyVideoSessions.userId, userId), eq(studyVideoSessions.id, sessionId),
      eq(studyVideoSessions.sourceMode, "external"), eq(studyVideoSessions.phase, "completed"));
    const [session] = await tx.select({ activeSeconds: studyVideoSessions.activeSeconds }).from(studyVideoSessions).where(owned).for("update");
    if (!session) throw new Error("اختار درس خارجي خلصت جلسته.");
    const corrections = state.correctedVideoSessions ??= {};
    if (session.activeSeconds === minutes * 60) return;
    const [original] = corrections[sessionId] ? [] : await tx.select({ minutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)` })
      .from(studyEvents).where(and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "video_block"),
        like(studyEvents.referenceId, "video:" + sessionId + ":block:%")));
    const previous = corrections[sessionId] ? Math.floor(session.activeSeconds / 60) : Number(original?.minutes ?? 0);
    state.correctedVideoMinutes = (state.correctedVideoMinutes ?? 0) + minutes - previous;
    corrections[sessionId] = true;
    await tx.update(studyVideoSessions).set({ activeSeconds: minutes * 60 }).where(owned);
  });
}

export async function scheduleVideoReview(userId: number, sessionId: number, note: string, seconds: number) {
  const cycle = await getActiveCycle(userId);
  return changePlanner(userId, async (state, tx) => {
    const [session] = await tx.select().from(studyVideoSessions)
      .where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))).limit(1);
    if (!session) throw new Error("جلسة الفيديو غير موجودة.");
    const existing = state.videoReviewTasks?.[sessionId];
    if (existing) return existing;
    const today = plannerToday();
    const subjectRows = await tx.select({ id: subjects.id, title: subjects.title }).from(subjects).where(eq(subjects.userId, userId));
    const subject = subjectRows.find(row => videoSubject(row.title) === session.subject);
    const exams = subject ? examOccurrences(await scheduledExamRows(tx, userId), today, shiftPlannerDay(today, 90), state.slots) : [];
    const next = exams.find(exam => exam.subjectId === subject?.id && exam.scheduledAt > new Date());
    const day = next ? [today, shiftPlannerDay(plannerToday(next.scheduledAt), -1)].sort().at(-1)! : shiftPlannerDay(today, 1);
    await tx.insert(videoNotes).values({ userId, sessionId, title: "مراجعة بعد الدرس", content: note, timestampSeconds: seconds });
    const [task] = await tx.insert(tasks).values({ userId, cycleId: cycle.id, title: ("راجع · " + (session.lessonTitle ?? "فيديو المذاكرة")).slice(0, 200),
      description: note + "\nموضع الفيديو بالثواني: " + seconds, scheduledFor: day, deadline: next?.scheduledAt,
      priority: "medium", category: "مراجعة" });
    (state.videoReviewTasks ??= {})[sessionId] = task.insertId;
    return task.insertId;
  });
}

export async function endVideoSession(userId: number, sessionId: number) {
  const result = await updateExternalVideo(userId, sessionId, "end");
  return { ended: true, activeSeconds: result.session.activeSeconds };
}

export async function openVideoSessions(userId: number, subject?: typeof studyVideoSessions.$inferSelect.subject) {
  const db = await database();
  return db.select().from(studyVideoSessions).where(and(
    eq(studyVideoSessions.userId, userId),
    subject === undefined ? undefined : eq(studyVideoSessions.subject, subject),
    inArray(studyVideoSessions.phase, ["watching", "break"]),
  )).orderBy(desc(studyVideoSessions.updatedAt), desc(studyVideoSessions.id));
}

export async function currentVideoSession(userId: number, subject?: typeof studyVideoSessions.$inferSelect.subject) {
  return (await openVideoSessions(userId, subject))[0] ?? null;
}
export async function listVideoSessions(userId: number) { const db = await database(); const sessions = await db.select().from(studyVideoSessions).where(eq(studyVideoSessions.userId, userId)).orderBy(desc(studyVideoSessions.updatedAt)); return Promise.all(sessions.map(async session => ({ ...session, notes: await db.select().from(videoNotes).where(and(eq(videoNotes.userId, userId), eq(videoNotes.sessionId, session.id))).orderBy(desc(videoNotes.updatedAt)) }))); }
export async function createVideoNote(userId: number, input: { sessionId: number; title: string; content: string; timestampSeconds?: number }) { const db = await database(); const session = await db.select({ id: studyVideoSessions.id }).from(studyVideoSessions).where(and(eq(studyVideoSessions.id, input.sessionId), eq(studyVideoSessions.userId, userId))).limit(1); if (!session[0]) throw new Error("جلسة الفيديو غير موجودة."); await db.insert(videoNotes).values({ userId, sessionId: input.sessionId, title: input.title, content: input.content, timestampSeconds: input.timestampSeconds ?? null }); }
export async function updateVideoNote(userId: number, noteId: number, input: { title: string; content: string; timestampSeconds?: number }) { const db = await database(); const result = await db.update(videoNotes).set({ title: input.title, content: input.content, timestampSeconds: input.timestampSeconds ?? null }).where(and(eq(videoNotes.id, noteId), eq(videoNotes.userId, userId))); if (!result) throw new Error("الملاحظة غير موجودة."); }
export async function deleteVideoNote(userId: number, noteId: number) { const db = await database(); return db.delete(videoNotes).where(and(eq(videoNotes.id, noteId), eq(videoNotes.userId, userId))); }
export async function trackVideoPlayback(userId: number, sessionId: number, input: { active: boolean; playbackPosition?: number; external?: boolean }) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId));
    const [item] = await tx.select().from(studyVideoSessions).where(owned).for("update");
    if (!item) throw new Error("جلسة الفيديو غير موجودة.");
    if (item.phase !== "watching" || item.sourceMode !== (input.external ? "external" : "embedded")) {
      return { session: item, addedSeconds: 0, blockCompleted: false, phase: item.phase };
    }
    const now = new Date();
    if (input.active && !item.lastPlaybackAt) await changeStudyBreak(tx, userId, now);
    const position = Math.max(0, Math.floor(input.playbackPosition ?? item.lastPlaybackPosition ?? 0));
    const activeSeconds = Math.max(item.activeSeconds, position);
    const completedBlocks = Math.floor(activeSeconds / 2700);
    const blockCompleted = completedBlocks > item.completedBlocks;
    const phase = blockCompleted ? "break" as const : "watching" as const;
    const changes = {
      activeSeconds, completedBlocks, phase, ...(input.external ? { timerRunning: false } : {}),
      breakEndsAt: blockCompleted ? new Date(+now + 15 * 60_000) : null,
      lastPlaybackAt: blockCompleted || !input.active ? null : now,
      lastPlaybackPosition: position,
    };
    await tx.update(studyVideoSessions).set(changes).where(owned);
    await awardVideoBlocks(tx, item, completedBlocks);
    if (blockCompleted) await changeStudyBreak(tx, userId, now, 15);
    return { session: { ...item, ...changes }, addedSeconds: activeSeconds - item.activeSeconds, blockCompleted, phase };
  });
  if (result.blockCompleted) await evaluateAchievements(userId, result.session.cycleId).catch(() => []);
  return result;
}
export async function resumeVideoSession(userId: number, sessionId: number, skipBreak = false) {
  const db = await database();
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId));
    const [item] = await tx.select().from(studyVideoSessions).where(owned).for("update");
    if (!item) throw new Error("جلسة الفيديو غير موجودة.");
    if (item.phase !== "break") return { resumed: false };
    const now = new Date();
    if (!skipBreak && item.breakEndsAt && item.breakEndsAt > now) throw new Error("فترة الاستراحة لم تنتهِ بعد.");
    await changeStudyBreak(tx, userId, now);
    await tx.update(studyVideoSessions).set({ phase: "watching", breakEndsAt: null, lastPlaybackAt: null }).where(owned);
    return { resumed: true };
  });
}
export async function setVideoManualProgress(userId: number, sessionId: number, progress: "started" | "middle" | "finished" | "reviewed") { const db = await database(); const result = await db.update(studyVideoSessions).set({ manualProgress: progress }).where(and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId))); if (!result[0]?.affectedRows) throw new Error("جلسة الفيديو غير موجودة."); return { progress }; }
async function awardVideoBlocks(tx: StudyTransaction, item: typeof studyVideoSessions.$inferSelect, completedBlocks: number) {
  const { userId, id: sessionId } = item;
  if (completedBlocks > item.completedBlocks) {
    const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
      .where(eq(coinRateSettings.rateKey, "video_block"));
    const amount = rate?.amount ?? 25;
    for (let block = item.completedBlocks + 1; block <= completedBlocks; block++) {
      const reference = `video:${sessionId}:block:${block}`;
      await tx.insert(studyEvents).values({
        userId, cycleId: item.cycleId, eventType: "video_block", referenceId: reference, durationMinutes: videoBlockSeconds / 60,
      }).onDuplicateKeyUpdate({ set: { referenceId: reference } });
      if (amount > 0) await tx.insert(coinTransactions).values({
        userId, cycleId: item.cycleId, type: "earn", amount, referenceKey: reference,
        reason: "فيديو مذاكرة — 45 دقيقة",
      }).onDuplicateKeyUpdate({ set: { referenceKey: reference } });
    }
  }
}

async function updateExternalVideo(userId: number, sessionId: number, action: "start" | "pause" | "tick" | "end", elapsedMinutes = 0) {
  const db = await database();
  const result = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.userId, userId));
    const [item] = await tx.select().from(studyVideoSessions).where(owned).for("update");
    if (!item) throw new Error("جلسة الفيديو غير موجودة.");
    if (item.phase === "completed") return { session: item, blockCompleted: false };
    const now = new Date();
    if (item.sourceMode !== "external") {
      if (action !== "end") throw new Error("هذا المؤقت مخصص للدروس الخارجية فقط.");
      if (item.phase === "break") await changeStudyBreak(tx, userId, now);
      const changes = { phase: "completed" as const, lastPlaybackAt: null, timerRunning: false, breakEndsAt: null };
      await tx.update(studyVideoSessions).set(changes).where(owned);
      return { session: { ...item, ...changes }, blockCompleted: false };
    }

    const deadline = externalVideoDeadline(item);
    const due = deadline !== null && +now >= deadline;
    if (action === "tick" && !due) return { session: item, blockCompleted: false };
    if (action === "start" && !due) {
      if (item.timerRunning) {
        if (elapsedMinutes) throw new Error("المؤقت شغّال بالفعل.");
        return { session: item, blockCompleted: false };
      }
      if (item.phase === "break" && item.breakEndsAt && item.breakEndsAt > now) throw new Error("فترة الاستراحة لم تنتهِ بعد.");
      const changes = { phase: "watching" as const, timerRunning: true, breakEndsAt: null,
        lastPlaybackAt: new Date(+now - elapsedMinutes * 60_000) };
      await changeStudyBreak(tx, userId, now);
      await tx.update(studyVideoSessions).set(changes).where(owned);
      return { session: { ...item, ...changes }, blockCompleted: false };
    }
    if (action === "pause" && !item.timerRunning) return { session: item, blockCompleted: false };

    const activeSeconds = externalVideoElapsed(item, +now);
    const completedBlocks = Math.max(item.completedBlocks, Math.floor(activeSeconds / videoBlockSeconds));
    const blockCompleted = completedBlocks > item.completedBlocks;
    const phase = action === "end" ? "completed" as const : blockCompleted ? "break" as const : "watching" as const;
    const changes = { activeSeconds, completedBlocks, phase, timerRunning: false, lastPlaybackAt: null,
      breakEndsAt: phase === "break" ? new Date(+now + 15 * 60_000) : null };
    await awardVideoBlocks(tx, item, completedBlocks);
    await tx.update(studyVideoSessions).set(changes).where(owned);
    if (phase === "break") await changeStudyBreak(tx, userId, now, 15);
    if (item.phase === "break" && action === "end") await changeStudyBreak(tx, userId, now);
    return { session: { ...item, ...changes }, blockCompleted };
  });
  if (result.blockCompleted) await evaluateAchievements(userId, result.session.cycleId).catch(() => []);
  return result;
}

export function setExternalVideoTimer(userId: number, sessionId: number, running?: boolean, elapsedMinutes?: number) {
  return updateExternalVideo(userId, sessionId, running === undefined ? "tick" : running ? "start" : "pause", elapsedMinutes);
}

export function fallbackComprehension(score: number, difficulty: "easy" | "medium" | "hard", priorAverage: number) { return deriveFallbackComprehension(score, difficulty, priorAverage); }
async function estimateComprehension(input: { score: number; correctAnswers: number; incorrectAnswers: number; difficulty: "easy" | "medium" | "hard"; missedTopics: string[]; priorAverage: number }) { const fallback = fallbackComprehension(input.score, input.difficulty, input.priorAverage); try { const response = await invokeLLM({ messages: [{ role: "system", content: "You are a careful study analyst. Return only a JSON object with a whole-number comprehensionScore from 0 to 100. Use exam score, errors, difficulty, missed topics, and previous average. Never award coins." }, { role: "user", content: JSON.stringify(input) }], response_format: { type: "json_schema", json_schema: { name: "comprehension", strict: true, schema: { type: "object", properties: { comprehensionScore: { type: "integer", minimum: 0, maximum: 100 } }, required: ["comprehensionScore"], additionalProperties: false } } } }); const content = response.choices[0]?.message?.content; const parsed = typeof content === "string" ? JSON.parse(content) : null; return Math.max(0, Math.min(100, Number(parsed?.comprehensionScore ?? fallback))); } catch { return fallback; }
}
export async function listExamsLegacy(userId: number) { const db = await database(); return db.select({ exam: exams, subject: subjects.title }).from(exams).leftJoin(subjects, eq(exams.subjectId, subjects.id)).where(eq(exams.userId, userId)).orderBy(exams.scheduledAt); }
export async function createExamLegacy(userId: number, input: { title: string; subjectId?: number; chapterId?: number; lessonId?: number; scheduledAt?: Date }) { const db = await database(); const cycle = await getActiveCycle(userId); await db.insert(exams).values({ userId, cycleId: cycle.id, ...input, subjectId: input.subjectId ?? null, chapterId: input.chapterId ?? null, lessonId: input.lessonId ?? null, scheduledAt: input.scheduledAt ?? null }); }
function examPerformanceDay(attempt: { takenOn: string | null; scheduledAt: Date | null; recordedAt: Date }) {
  if (attempt.takenOn) return attempt.takenOn;
  const scheduled = attempt.scheduledAt && yearReviewDate(+attempt.scheduledAt);
  return scheduled && scheduled <= yearReviewDate(+attempt.recordedAt) ? scheduled : null;
}

export async function setExamAttemptDate(userId: number, attemptId: number, takenOn: string) {
  if (takenOn > plannerToday()) throw new Error("اختار تاريخ النهارده أو يوم قبله.");
  const db = await database();
  const [result] = await db.update(examAttempts).set({ takenOn })
    .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.userId, userId)));
  if (!result.affectedRows) {
    const [existing] = await db.select({ id: examAttempts.id }).from(examAttempts)
      .where(and(eq(examAttempts.id, attemptId), eq(examAttempts.userId, userId)));
    if (!existing) throw new Error("المحاولة مش موجودة.");
  }
}

export async function completeExamAttempt(userId: number, input: { examId: number; takenOn?: string; totalQuestions: number; correctAnswers: number; difficulty: "easy" | "medium" | "hard"; missedTopics: string[] }) { if (input.takenOn && input.takenOn > plannerToday()) throw new Error("اختار تاريخ النهارده أو يوم قبله."); const db = await database(); const exam = await db.select().from(exams).where(and(eq(exams.id, input.examId), eq(exams.userId, userId), isNull(exams.archivedAt))).limit(1); if (!exam[0]) throw new Error("الامتحان غير موجود."); if (input.correctAnswers > input.totalQuestions) throw new Error("عدد الإجابات الصحيحة غير صحيح."); const incorrectAnswers = input.totalQuestions - input.correctAnswers; const score = Math.round((input.correctAnswers / input.totalQuestions) * 100); const [prior] = await db.select({ average: sql<number>`coalesce(avg(${examAttempts.score}), 0)` }).from(examAttempts).where(eq(examAttempts.userId, userId)); const comprehensionScore = await estimateComprehension({ score, correctAnswers: input.correctAnswers, incorrectAnswers, difficulty: input.difficulty, missedTopics: input.missedTopics, priorAverage: Number(prior?.average ?? 0) }); const [inserted] = await db.insert(examAttempts).values({ userId, cycleId: exam[0].cycleId, examId: input.examId, totalQuestions: input.totalQuestions, correctAnswers: input.correctAnswers, incorrectAnswers, score, difficulty: input.difficulty, missedTopics: input.missedTopics, comprehensionScore, completionRewarded: true, takenOn: input.takenOn }); const attempt = await db.select().from(examAttempts).where(and(eq(examAttempts.id, inserted.insertId), eq(examAttempts.userId, userId))).limit(1); const ref = `examAttempt:${attempt[0].id}`; await recordStudyEvent({ userId, cycleId: exam[0].cycleId, eventType: "exam_complete", referenceId: ref }); const completion = await awardCoins({ userId, cycleId: exam[0].cycleId, amount: 15, rateKey: "exam_complete", reason: `إكمال امتحان: ${exam[0].title}`, referenceKey: `${ref}:completion` }); const bonusDefault = examBonusForComprehension(comprehensionScore); const threshold = [95, 90, 80, 70, 60].find(value => comprehensionScore >= value); const bonus = threshold ? await awardCoins({ userId, cycleId: exam[0].cycleId, amount: bonusDefault, rateKey: ("exam_bonus_" + threshold) as CoinRateKey, reason: `مكافأة الاستيعاب: ${comprehensionScore}%`, referenceKey: `${ref}:comprehension` }) : { awarded: false, amount: 0 }; return { attempt: attempt[0], score, comprehensionScore, completion, bonus, bonusAmount: bonus.amount, unlocks: await evaluateAchievements(userId, exam[0].cycleId) }; }


async function scheduledExamRows(db: Pick<StudyTransaction, "select">, userId: number) {
  return db.select().from(exams).where(and(eq(exams.userId, userId), isNull(exams.archivedAt), isNotNull(exams.scheduledAt)));
}

async function upcomingExamOccurrences(userId: number, limit: number) {
  const db = await database();
  const [rows, planner, subjectsRows] = await Promise.all([
    scheduledExamRows(db, userId), getPlanner(userId),
    db.select({ id: subjects.id, title: subjects.title }).from(subjects).where(eq(subjects.userId, userId)),
  ]);
  const today = plannerToday();
  const now = Date.now();
  const next = examOccurrences(rows, today, shiftPlannerDay(today, 28), planner.slots);
  const later = rows.flatMap(exam => {
    const day = exam.scheduledAt && examLocalDate(exam.scheduledAt).slice(0, 10);
    return day && day > shiftPlannerDay(today, 28) ? examOccurrences([exam], day, day, planner.slots) : [];
  });
  const seen = new Set<number>();
  return [...next, ...later].filter(exam => +exam.endAt > now).sort((a, b) => +a.scheduledAt - +b.scheduledAt)
    .filter(exam => { if (seen.has(exam.id)) return false; seen.add(exam.id); return true; })
    .slice(0, limit).map(exam => ({ ...exam, subject: subjectsRows.find(subject => subject.id === exam.subjectId)?.title ?? null }));
}

function examDays(from: Date, to: Date) {
  const first = examLocalDate(from).slice(0, 10), last = examLocalDate(to).slice(0, 10);
  return [first, last > shiftPlannerDay(first, 366) ? shiftPlannerDay(first, 366) : last] as const;
}

export async function listCalendar(userId: number, from: Date, to: Date) { const db = await database(); const [taskItems, scheduled, goalItems, customItems, sessions, planner] = await Promise.all([db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt), gte(tasks.deadline, from), lte(tasks.deadline, to))), scheduledExamRows(db, userId), db.select().from(goals).where(and(eq(goals.userId, userId), gte(goals.deadline, from), lte(goals.deadline, to))), db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId), gte(calendarEvents.startsAt, from), lte(calendarEvents.startsAt, to))), db.select().from(pomodoroSessions).where(and(eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.state, "completed"), gte(pomodoroSessions.completedAt, from), lte(pomodoroSessions.completedAt, to))), getPlanner(userId)]); const examItems = examOccurrences(scheduled, ...examDays(from, to), planner.slots); return { tasks: taskItems, exams: examItems, goals: goalItems, events: customItems, sessions }; }
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

export async function createExam(userId: number, input: { title: string; subjectId?: number; chapterId?: number; lessonId?: number; scheduledAt?: Date; lessonIds?: number[]; scheduleOptions?: ExamScheduleOptions }) {
  if (input.scheduleOptions?.repeatWeekly && !input.scheduledAt) throw new Error("حدد تاريخ أول امتحان أسبوعي.");
  const db = await database(); const cycle = await getActiveCycle(userId); const lessonIds = Array.from(new Set([...(input.lessonIds ?? []), ...(input.lessonId ? [input.lessonId] : [])]));
  return db.transaction(async tx => {
  if (lessonIds.length) {
    const owned = await tx.select({ id: lessons.id }).from(lessons).innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id)).where(and(inArray(lessons.id, lessonIds), eq(subjects.userId, userId), isNull(lessons.deletedAt)));
    if (owned.length !== lessonIds.length) throw new Error("اختر دروسًا موجودة ضمن خطتك فقط.");
  }
  const [inserted] = await tx.insert(exams).values({ userId, cycleId: cycle.id, title: input.title, subjectId: input.subjectId ?? null, chapterId: input.chapterId ?? null, lessonId: input.lessonId ?? null, scheduledAt: input.scheduledAt ?? null, scheduleOptions: input.scheduleOptions });
  const created = await tx.select().from(exams).where(and(eq(exams.userId, userId), eq(exams.id, inserted.insertId))).limit(1);
  if (created[0] && lessonIds.length) await tx.insert(examLessons).values(lessonIds.map(lessonId => ({ examId: created[0].id, lessonId })));
  return created[0];
  });
}

export async function updateExam(userId: number, input: { examId: number; title: string; scheduledAt?: Date | null; lessonIds?: number[]; subjectId?: number; chapterId?: number | null; scheduleOptions?: ExamScheduleOptions }) {
  const db = await database();
  return db.transaction(async tx => {
    const owned = and(eq(exams.id, input.examId), eq(exams.userId, userId));
    const [exam] = await tx.select({ id: exams.id, scheduledAt: exams.scheduledAt, scheduleOptions: exams.scheduleOptions }).from(exams).where(owned).for("update");
    if (!exam) throw new Error("الامتحان غير موجود.");
    const scheduled = input.scheduledAt === undefined ? exam.scheduledAt : input.scheduledAt;
    if ((input.scheduleOptions ?? exam.scheduleOptions)?.repeatWeekly && !scheduled) throw new Error("حدد تاريخ أول امتحان أسبوعي.");
    const lessonIds = input.lessonIds === undefined ? undefined : [...new Set(input.lessonIds)];
    if (lessonIds?.length) {
      const valid = await tx.select({ id: lessons.id }).from(lessons)
        .innerJoin(chapters, eq(lessons.chapterId, chapters.id))
        .innerJoin(subjects, eq(chapters.subjectId, subjects.id))
        .where(and(eq(subjects.userId, userId), isNull(lessons.deletedAt), inArray(lessons.id, lessonIds)));
      if (valid.length !== lessonIds.length) throw new Error("اختر دروسًا موجودة ضمن خطتك فقط.");
    }
    await tx.update(exams).set({ title: input.title, scheduledAt: input.scheduledAt, scheduleOptions: input.scheduleOptions, ...(lessonIds === undefined ? {} : { lessonId: null, chapterId: input.chapterId ?? null, subjectId: input.subjectId ?? null }) }).where(owned);
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
  const [rows, attempts, upcoming] = await Promise.all([
    db.select({ exam: exams, subject: subjects.title }).from(exams)
      .leftJoin(subjects, eq(exams.subjectId, subjects.id))
      .where(eq(exams.userId, userId)).orderBy(exams.scheduledAt),
    db.select({ id: examAttempts.id, examId: examAttempts.examId, score: examAttempts.score, comprehension: examAttempts.comprehensionScore, takenOn: examAttempts.takenOn, recordedAt: examAttempts.createdAt })
      .from(examAttempts).where(eq(examAttempts.userId, userId)).orderBy(desc(examAttempts.createdAt), desc(examAttempts.id)),
    upcomingExamOccurrences(userId, Infinity),
  ]);
  const attemptsByExam = new Map<number, typeof attempts>();
  for (const attempt of attempts) {
    const history = attemptsByExam.get(attempt.examId) ?? [];
    history.push(attempt);
    attemptsByExam.set(attempt.examId, history);
  }
  const nextById = new Map(upcoming.map(item => [item.id, item.scheduledAt]));
  return Promise.all(rows.map(async row => {
    const scoped = await scopedExamLessons(db, userId, row.exam.id);
    const attempts = (attemptsByExam.get(row.exam.id) ?? []).map(attempt => ({
      ...attempt, date: examPerformanceDay({ ...attempt, scheduledAt: row.exam.scheduledAt }),
    }));
    return { ...row, nextScheduledAt: nextById.get(row.exam.id) ?? null, lessons: scoped, readiness: readinessForLessons(scoped), attempts };
  }));
}

function studyWeek(day: string) {
  return shiftPlannerDay(day, -((plannerWeekday(day) + 1) % 7));
}

export async function weeklyStudyOverview(userId: number, day: string) {
  if (day !== plannerToday()) throw new Error("حدّث الصفحة عشان تشوف خطة الأسبوع الحالية.");
  const friday = plannerWeekday(day) === 5;
  const currentWeek = studyWeek(day);
  const week = friday ? shiftPlannerDay(currentWeek, 7) : currentWeek;
  const recapStart = friday ? shiftPlannerDay(day, -7) : day;
  const recapEnd = friday ? shiftPlannerDay(day, -1) : day;
  const db = await database();
  const [state, plan, taskRows, attempts, activity] = await Promise.all([
    getPlanner(userId),
    listStudyPlan(userId),
    listTasks(userId),
    db.select({ id: examAttempts.id, takenOn: examAttempts.takenOn, recordedAt: examAttempts.createdAt,
      scheduledAt: exams.scheduledAt, score: examAttempts.score, title: exams.title, subjectId: exams.subjectId })
      .from(examAttempts).innerJoin(exams, eq(exams.id, examAttempts.examId))
      .where(and(eq(examAttempts.userId, userId), eq(exams.userId, userId))),
    db.select({ subjectId: studyEvents.subjectId, at: studyEvents.occurredAt }).from(studyEvents)
      .where(and(eq(studyEvents.userId, userId), isNotNull(studyEvents.subjectId),
        gte(studyEvents.occurredAt, cairoPlannerTime(shiftPlannerDay(day, -14), "00:00"))))
      .orderBy(desc(studyEvents.occurredAt)),
  ]);
  const prefs: WeeklyStudy = state.weeklyStudy?.[week] ?? {};
  const backlog = new Set(state.backlog ?? []);
  const inRecap = (date: string) => date >= recapStart && date <= recapEnd;
  const lessonRows = plan.rows.flatMap(row => row.lesson ? [{ ...row, lesson: row.lesson }] : []);
  const waiting = lessonRows.filter(row => backlog.has(row.lesson.id) && row.progress?.status !== "completed");
  const lessonDetails = lessonRows.flatMap(row => {
    const completed = row.progress?.status === "completed" && row.progress.completedAt && plannerToday(row.progress.completedAt);
    if (!completed || !inRecap(completed)) return [];
    return [{ id: row.lesson.id, title: row.lesson.title, subject: row.subject.title, day: completed,
      backlog: backlog.has(row.lesson.id) || state.finishedBacklog?.[row.lesson.id] === completed }];
  }).sort((a, b) => b.day.localeCompare(a.day));
  const completedTasks = taskRows.filter(task => task.status === "completed" && task.completedAt && inRecap(plannerToday(task.completedAt)));
  const dueHomework = taskRows.filter(task => task.category === "واجب" && task.deadline && inRecap(plannerToday(task.deadline)));
  const onTime = (task: typeof taskRows[number]) => task.status === "completed" && task.completedAt !== null
    && task.deadline !== null && +task.completedAt <= +task.deadline;
  const bestPrevious = new Map<number, number>();
  const improved = attempts.flatMap(attempt => {
    const date = examPerformanceDay(attempt);
    return date && date <= recapEnd && attempt.subjectId !== null ? [{ ...attempt, date, subjectId: attempt.subjectId }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || +a.recordedAt - +b.recordedAt || a.id - b.id).flatMap(attempt => {
    const prior = bestPrevious.get(attempt.subjectId);
    bestPrevious.set(attempt.subjectId, Math.max(prior ?? 0, attempt.score));
    return prior !== undefined && attempt.score > prior && inRecap(attempt.date)
      ? [{ id: attempt.id, title: attempt.title, score: attempt.score, previous: prior, day: attempt.date }] : [];
  });
  const homework = taskRows.filter(task => task.category === "واجب" && task.status === "open")
    .sort((a, b) => (a.deadline ? +a.deadline : Infinity) - (b.deadline ? +b.deadline : Infinity) || a.id - b.id);
  const effort = prefs.effort ?? "normal";
  const pickingSaturday = friday || day === week;
  const { free } = await studyAvailability(db, userId, state, friday ? week : day);
  const available = Math.max(0, ...free.map(gap => gap.end - gap.start));
  const remaining = free.reduce((sum, gap) => sum + gap.end - gap.start, 0);
  const budget = Math.min(available, Math.max(0, remaining - 30), studyEfforts[effort].minutes);
  const nextClass = (id: number) => Array.from({ length: 7 }, (_, index) => shiftPlannerDay(week, index))
    .find(date => date >= day && state.slots.some(slot => slot.subjectId === id && slotOccurs(slot, date)));
  const bySubject = new Map<number, typeof waiting>();
  for (const row of waiting) {
    const group = bySubject.get(row.subject.id) ?? [];
    group.push(row);
    bySubject.set(row.subject.id, group);
  }
  const ranked = Array.from(bySubject.entries()).map(([id, group]) => {
    const next = nextClass(id);
    const last = activity.find(item => item.subjectId === id)?.at;
    const [currentRow] = upcomingClassLessons(lessonRows.filter(row => row.subject.id === id), state, id);
    const prerequisite = currentRow && group.find(row => row.chapter?.id === currentRow.chapter?.id
      && lessonRows.indexOf(row) < lessonRows.indexOf(currentRow));
    return { id, group, next, last, prerequisite };
  }).sort((a, b) => Number(Boolean(b.prerequisite && b.next)) - Number(Boolean(a.prerequisite && a.next))
    || (a.next ?? "9999").localeCompare(b.next ?? "9999") || +(a.last ?? 0) - +(b.last ?? 0));
  const lessonOption = (row: typeof lessonRows[number], reason: string) => ({
    kind: "lesson" as const, id: row.lesson.id, title: row.lesson.title, subject: row.subject.title, description: row.lesson.description,
    minutes: Math.min(budget, Math.max(5, row.lesson.estimatedMinutes)), reason,
  });
  const homeworkOption = (task: typeof taskRows[number]) => ({
    kind: "homework" as const, id: task.id, title: task.title, subject: null, description: task.description,
    minutes: Math.min(budget, 25), reason: task.deadline ? "واجب له ميعاد تسليم" : "واجب لسه مفتوح",
  });
  const first = ranked[0];
  const balance = ranked.filter(entry => entry.id !== first?.id)
    .sort((a, b) => +(a.last ?? 0) - +(b.last ?? 0))[0];
  const suggestions = budget < 5 ? [] : [
    ...(first ? [lessonOption(first.prerequisite ?? first.group[0], first.prerequisite && first.next
      ? "درس أقدم من نفس الفصل قبل الحصة الجاية" : first.next ? "مادة لها حصة قريبة" : "درس من المتراكم")] : []),
    ...(homework[0] ? [homeworkOption(homework[0])] : []),
    ...(balance ? [lessonOption(balance.group[0], "مادة بقالها مدة من غير نشاط")] : []),
    ...ranked.flatMap(entry => entry.group.map(row => lessonOption(row, "درس من المتراكم"))),
    ...homework.map(homeworkOption),
    ...lessonRows.filter(row => row.progress?.status !== "completed").map(row => lessonOption(row, "الدرس الجاي في المنهج")),
  ].filter((item, index, all) => all.findIndex(other => other.kind === item.kind && other.id === item.id) === index).slice(0, 3);
  const pickedLesson = prefs.start?.kind === "lesson" ? lessonRows.find(row => row.lesson.id === prefs.start?.id) : undefined;
  const pickedTask = prefs.start?.kind === "homework" ? taskRows.find(task => task.id === prefs.start?.id) : undefined;
  const picked = pickedLesson?.progress?.status !== "completed" && pickedLesson ? lessonOption(pickedLesson, "اختيارك لبداية السبت")
    : pickedTask?.status === "open" ? homeworkOption(pickedTask) : null;
  const cutoff = shiftPlannerDay(week, 7);
  const goalProgress = (goal: WeeklyStudy["goal"], start: string, end: string) => {
    if (!goal) return null;
    const includes = (date: Date | null) => Boolean(date && plannerToday(date) >= start && plannerToday(date) < end);
    if (goal.kind === "backlog") {
      const units = lessonRows.filter(row => goal.lessonIds.includes(row.lesson.id) && row.progress?.status === "completed"
        && includes(row.progress.completedAt)).length;
      return { title: "دروس متراكمة · " + (plan.rows.find(row => row.subject.id === goal.subjectId)?.subject.title ?? "مادة"), done: units, target: goal.target };
    }
    const task = taskRows.find(row => row.id === goal.taskId);
    const complete = task?.status === "completed" && includes(task.completedAt)
      && (!goal.deadline || Boolean(task.completedAt && +task.completedAt <= +new Date(goal.deadline)));
    return { title: task?.title ?? "واجب الأسبوع", done: Number(complete), target: 1 };
  };
  return { week, effort, pickingSaturday, available, budget, suggestions, picked: pickingSaturday ? picked : null,
    choices: { subjects: Array.from(bySubject.entries()).map(([id, rows]) => ({ id, title: rows[0].subject.title, count: rows.length })),
      homework: homework.map(task => ({ id: task.id, title: task.title })) },
    goal: goalProgress(prefs.goal, week, cutoff),
    deferred: friday ? (state.studySessions ?? []).filter(item => item.postponeReason && !item.done)
      .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start))
      .map(({ id, title, day }) => ({ id, title, day })) : [],
    recapGoal: friday ? goalProgress(state.weeklyStudy?.[currentWeek]?.goal, currentWeek, week) : null,
    lessons: lessonDetails, tasks: completedTasks.map(task => ({ id: task.id, title: task.title })),
    improved,
    cleared: lessonDetails.filter(item => item.backlog).length,
    allHomeworkOnTime: friday && dueHomework.length > 0 && dueHomework.every(onTime),
  };
}

export function saveWeeklyStudy(userId: number, input: {
  week: string; effort?: StudyEffort; start?: StudyItem | null;
  goal?: { kind: "backlog"; subjectId: number; target: number } | { kind: "homework"; taskId: number } | null;
}) {
  const day = plannerToday();
  const currentWeek = studyWeek(day);
  const planningWeek = plannerWeekday(day) === 5 ? shiftPlannerDay(currentWeek, 7) : currentWeek;
  if (input.week !== planningWeek) throw new Error("حدّث الصفحة عشان تختار للأسبوع الحالي.");
  return changePlanner(userId, async (state, tx) => {
    const existing = (state.weeklyStudy ??= {})[input.week] ?? {};
    const next = { ...existing };
    if (input.effort !== undefined) next.effort = input.effort;
    if (input.start !== undefined) {
      if (input.start?.kind === "lesson") await ownedLesson(tx, userId, input.start.id);
      if (input.start?.kind === "homework") {
        const [task] = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId),
          eq(tasks.id, input.start.id), eq(tasks.category, "واجب"), eq(tasks.status, "open"), isNull(tasks.deletedAt)));
        if (!task) throw new Error("الواجب مش متاح.");
      }
      next.start = input.start ?? undefined;
    }
    if (input.goal === null) next.goal = undefined;
    if (input.goal?.kind === "backlog") {
      const goal = input.goal;
      const marked = state.backlog ?? [];
      if (!marked.length) throw new Error("مفيش دروس متراكمة للهدف.");
      const rows = await tx.select({ id: lessons.id, status: lessonProgress.status }).from(lessons)
        .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
        .innerJoin(subjects, eq(subjects.id, chapters.subjectId))
        .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)))
        .where(and(eq(subjects.userId, userId), eq(subjects.id, goal.subjectId), isNull(lessons.deletedAt), inArray(lessons.id, marked)));
      const lessonIds = rows.filter(row => row.status !== "completed").map(row => row.id);
      if (lessonIds.length < goal.target) throw new Error("اختار عدد دروس موجود في المتراكم.");
      next.goal = { ...goal, lessonIds };
    }
    if (input.goal?.kind === "homework") {
      const [task] = await tx.select({ deadline: tasks.deadline }).from(tasks).where(and(eq(tasks.userId, userId),
        eq(tasks.id, input.goal.taskId), eq(tasks.category, "واجب"), eq(tasks.status, "open"), isNull(tasks.deletedAt)));
      if (!task) throw new Error("الواجب مش متاح.");
      next.goal = { ...input.goal, deadline: task.deadline?.toISOString() ?? null };
    }
    state.weeklyStudy[input.week] = next;
  });
}

export async function dailyQuranSignals(userId: number, day: string) {
  const today = plannerToday();
  if (day > today || day < shiftPlannerDay(today, -1)) throw new Error("اختار آية اليوم الحالي.");
  const db = await database();
  const start = shiftPlannerDay(day, -7);
  const oldestExam = shiftPlannerDay(day, -30);
  const [events, examsForReflection, plan, backlogRows] = await Promise.all([
    db.select({ at: studyEvents.occurredAt, minutes: studyEvents.durationMinutes, kind: studyEvents.eventType })
      .from(studyEvents).where(and(eq(studyEvents.userId, userId),
        gte(studyEvents.occurredAt, cairoPlannerTime(start, "00:00")), lt(studyEvents.occurredAt, cairoPlannerTime(day, "00:00")))),
    db.select({ subjectId: subjects.id, subject: subjects.title, score: examAttempts.score,
      takenOn: examAttempts.takenOn, recordedAt: examAttempts.createdAt, scheduledAt: exams.scheduledAt })
      .from(examAttempts).innerJoin(exams, eq(exams.id, examAttempts.examId))
      .innerJoin(subjects, and(eq(subjects.id, exams.subjectId), eq(subjects.userId, userId)))
      .where(and(eq(examAttempts.userId, userId), eq(exams.userId, userId), isNull(exams.archivedAt),
        or(gte(examAttempts.takenOn, oldestExam), and(isNull(examAttempts.takenOn),
          gte(exams.scheduledAt, cairoPlannerTime(oldestExam, "00:00")))))),
    getPlanner(userId), listStudyPlan(userId),
  ]);
  const marked = new Set(plan.backlog ?? []);
  const attempts = examsForReflection.flatMap(row => {
    const date = examPerformanceDay(row);
    return date && date >= oldestExam && date < day ? [{ subjectId: row.subjectId, subject: row.subject,
      score: row.score, day: date, recordedAt: +row.recordedAt }] : [];
  }).sort((a, b) => b.day.localeCompare(a.day) || b.recordedAt - a.recordedAt);
  const sleep = plan.sleepLogs?.[shiftPlannerDay(day, -1)];
  return {
    attempts, sleepMinutes: sleep ? sleepDuration(sleep) : null,
    sleepTarget: sleepTargetMinutes,
    backlog: backlogRows.rows.filter(row => row.lesson && marked.has(row.lesson.id) && row.progress?.status !== "completed").length,
    minutes: events.reduce((total, row) => total + Number(row.minutes), 0),
    activeDays: new Set(events.filter(row => row.minutes > 0).map(row => plannerToday(row.at))).size,
    lessons: events.filter(row => row.kind === "lesson_complete").length,
    tasks: events.filter(row => row.kind === "task_complete").length,
  };
}

export async function welcomeAchievements(userId: number, day: string) {
  const today = plannerToday();
  if (day > today || day < shiftPlannerDay(today, -1)) throw new Error("اختار يوم العرض الحالي.");
  const start = plannerWeekday(day) === 5 ? shiftPlannerDay(day, -7) : day;
  const end = plannerWeekday(day) === 5 ? day : shiftPlannerDay(day, 1);
  const db = await database();
  const rows = await db.select({
    occurredAt: studyEvents.occurredAt, minutes: studyEvents.durationMinutes, kind: studyEvents.eventType,
  }).from(studyEvents).where(and(eq(studyEvents.userId, userId),
    gte(studyEvents.occurredAt, cairoPlannerTime(start, "00:00")),
    lt(studyEvents.occurredAt, cairoPlannerTime(end, "00:00"))));
  const totals: Record<string, { minutes: number; lessons: number; tasks: number; sessions: number }> = {};
  for (const row of rows) {
    const date = plannerToday(row.occurredAt);
    const current = totals[date] ??= { minutes: 0, lessons: 0, tasks: 0, sessions: 0 };
    current.minutes += Number(row.minutes);
    if (row.kind === "lesson_complete") current.lessons++;
    if (row.kind === "task_complete") current.tasks++;
    if (row.kind === "pomodoro_complete") current.sessions++;
  }
  const overlap = studyOverlapByDay(await studyTimeRows(db, userId), plannerToday);
  for (const [day, total] of Object.entries(totals)) {
    total.minutes = Math.max(0, total.minutes - (overlap.get(day) ?? 0));
  }
  return totals;
}

async function examSubjectMap(db: StudyReader, userId: number) {
  const links = await db.select({ examId: examLessons.examId, subjectId: subjects.id }).from(examLessons)
    .innerJoin(exams, eq(examLessons.examId, exams.id)).innerJoin(lessons, eq(examLessons.lessonId, lessons.id))
    .innerJoin(chapters, eq(lessons.chapterId, chapters.id)).innerJoin(subjects, eq(chapters.subjectId, subjects.id))
    .where(and(eq(exams.userId, userId), eq(subjects.userId, userId)));
  const byExam = new Map<number, Set<number>>();
  for (const { examId, subjectId } of links) {
    const linked = byExam.get(examId) ?? new Set<number>();
    linked.add(subjectId);
    byExam.set(examId, linked);
  }
  return byExam;
}

function examAnalyticsSubject(linked: Set<number> | undefined, directSubject: number | null) {
  return linked?.size === 1 ? Array.from(linked)[0] : linked?.size ? null : directSubject;
}

export async function analytics(userId: number) {
  const db = await database();
  const timeRows = await studyTimeRows(db, userId);
  const overlap = studyOverlapByDay(timeRows, dateKey);
  const cycle = await getActiveCycle(userId); const metrics = await metricSnapshot(db, userId, timeRows); const coins = await getCoinSummary(db, userId);
  const eventDay = sql<string>`date(\`studyEvents\`.\`occurredAt\`)`;
  const subjectName = sql<string>`coalesce(${subjects.title}, 'بدون مادة')`;
  const [dailyRows, bySubject, completion, comprehension, purchases, planner, examSubjects, linkedSubjects] = await Promise.all([
    db.select({ day: eventDay, minutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)`, events: count(),
      videoMinutes: sql<number>`coalesce(sum(case when ${studyEvents.eventType} = 'video_block' then ${studyEvents.durationMinutes} else 0 end), 0)`,
      lessons: sql<number>`sum(case when ${studyEvents.eventType} = 'lesson_complete' then 1 else 0 end)`,
      tasks: sql<number>`sum(case when ${studyEvents.eventType} = 'task_complete' then 1 else 0 end)`,
      exams: sql<number>`sum(case when ${studyEvents.eventType} = 'exam_complete' then 1 else 0 end)`,
    }).from(studyEvents).where(eq(studyEvents.userId, userId)).groupBy(eventDay).orderBy(eventDay),
    db.select({ subject: subjectName, minutes: sql<number>`coalesce(sum(${studyEvents.durationMinutes}), 0)` }).from(studyEvents).leftJoin(subjects, eq(studyEvents.subjectId, subjects.id)).where(eq(studyEvents.userId, userId)).groupBy(studyEvents.subjectId, subjectName),
    db.select({ open: sql<number>`coalesce(sum(case when ${tasks.status} = 'open' then 1 else 0 end), 0)`, completed: sql<number>`coalesce(sum(case when ${tasks.status} = 'completed' then 1 else 0 end), 0)` }).from(tasks).where(eq(tasks.userId, userId)),
    db.select({ examId: examAttempts.examId, subjectId: exams.subjectId, takenOn: examAttempts.takenOn, recordedAt: examAttempts.createdAt, scheduledAt: exams.scheduledAt, score: examAttempts.score, comprehension: examAttempts.comprehensionScore })
      .from(examAttempts).innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(and(eq(examAttempts.userId, userId), eq(exams.userId, userId))),
    db.select({ value: count() }).from(rewardPurchases).where(eq(rewardPurchases.userId, userId)),
    getPlanner(userId),
    db.select({ id: subjects.id, title: subjects.title }).from(subjects).where(eq(subjects.userId, userId)).orderBy(subjects.title),
    examSubjectMap(db, userId),
  ]);
  const sessionsByDay = new Map<string, { id: number; at: Date; kind: string; minutes: number }[]>();
  for (const { id, at, kind, minutes } of timeRows) {
    const day = dateKey(at);
    const sessions = sessionsByDay.get(day) ?? [];
    sessions.push({ id, at, kind, minutes: Number(minutes) });
    sessionsByDay.set(day, sessions);
  }
  const daily = dailyRows.map(row => ({
    ...row,
    overlapMinutes: overlap.get(String(row.day).slice(0, 10)) ?? 0,
    sessions: (sessionsByDay.get(String(row.day).slice(0, 10)) ?? []).sort((a, b) => +a.at - +b.at),
    minutes: Math.max(0, Number(row.minutes) - (overlap.get(String(row.day).slice(0, 10)) ?? 0)),
  }));
  return { cycle, metrics, coins, daily, sleepLogs: planner.sleepLogs ?? {}, breakMilliseconds: planner.breakMilliseconds ?? {}, bySubject, completion: completion[0] ?? { open: 0, completed: 0 }, examSubjects, comprehension: comprehension.map(attempt => ({ date: examPerformanceDay(attempt), score: attempt.score, comprehension: attempt.comprehension,
    subjectId: examAnalyticsSubject(linkedSubjects.get(attempt.examId), attempt.subjectId) })), rewardsPurchased: Number(purchases[0]?.value ?? 0) };
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
  const [plan, events, attempts, examSubjects] = await Promise.all([
    listStudyPlan(userId),
    db.select({
      subjectId: studyEvents.subjectId, kind: studyEvents.eventType, minutes: studyEvents.durationMinutes,
      date: studyEvents.occurredAt, reason: coinTransactions.reason,
    }).from(studyEvents).leftJoin(coinTransactions, and(eq(coinTransactions.userId, userId), eq(coinTransactions.referenceKey, studyEvents.referenceId)))
      .where(eq(studyEvents.userId, userId)).orderBy(studyEvents.occurredAt),
    db.select({ examId: examAttempts.examId, subjectId: exams.subjectId, score: examAttempts.score, comprehension: examAttempts.comprehensionScore,
      attemptId: examAttempts.id, examTitle: exams.title, takenOn: examAttempts.takenOn, recordedAt: examAttempts.createdAt, scheduledAt: exams.scheduledAt, missed: examAttempts.missedTopics })
      .from(examAttempts).innerJoin(exams, eq(examAttempts.examId, exams.id))
      .where(and(eq(examAttempts.userId, userId), eq(exams.userId, userId)))
      .orderBy(desc(examAttempts.createdAt), desc(examAttempts.id)),
    examSubjectMap(db, userId),
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
  const orderedAttempts = attempts.map(attempt => ({ ...attempt, day: examPerformanceDay(attempt) }))
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? "") || b.attemptId - a.attemptId);
  for (const attempt of orderedAttempts) {
    const id = examAnalyticsSubject(examSubjects.get(attempt.examId), attempt.subjectId);
    const stats = (id === null ? null : subjectsById.get(id)) ?? unassigned;
    stats.attempts++;
    if (stats.recentAttempts.length < 10) stats.recentAttempts.push({
      id: attempt.attemptId, exam: attempt.examTitle, score: Number(attempt.score), date: attempt.day ?? "تاريخ الأداء غير محدد",
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
  return Array.from(subjectsById.values()).concat(unassigned).map(stats => ({
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
    id: studyEvents.id, subjectId: subjects.id, minutes: studyEvents.durationMinutes, date: studyEvents.occurredAt,
  }).from(studyEvents).leftJoin(subjects, and(eq(subjects.id, studyEvents.subjectId), eq(subjects.userId, userId))).where(and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "pomodoro_complete")))
    .orderBy(studyEvents.occurredAt, studyEvents.id);
}

function focusSessionId(reference: string) {
  const id = reference.match(/^pomodoro:(\d+):complete$/)?.[1] ?? reference.match(/^offline-focus:[a-f0-9-]{36}:(\d+)$/)?.[1];
  return id === undefined ? [] : [Number(id)];
}

export async function removeUnassignedFocus(userId: number, eventIds: number[]) {
  const db = await database();
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const uniqueIds = [...new Set(eventIds)];
    const ownedSubjects = tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.userId, userId));
    const subjectMissing = or(isNull(studyEvents.subjectId), notInArray(studyEvents.subjectId, ownedSubjects));
    const selected = and(eq(studyEvents.userId, userId), eq(studyEvents.eventType, "pomodoro_complete"), subjectMissing, inArray(studyEvents.id, uniqueIds));
    const rows = await tx.select({ reference: studyEvents.referenceId, cycleId: studyEvents.cycleId }).from(studyEvents).where(selected).for("update");
    if (rows.length !== uniqueIds.length) throw new Error("اختار جلسات موجودة من غير مادة فقط.");
    for (const row of rows.filter(item => item.reference.startsWith("offline-focus:"))) {
      await tx.insert(coinTransactions).values({
        userId, cycleId: row.cycleId, amount: 0, type: "earn", referenceKey: row.reference,
        reason: "جلسة تركيز حُذفت بعد المزامنة",
      }).onDuplicateKeyUpdate({ set: { referenceKey: row.reference } });
    }
    const sessionIds = rows.flatMap(row => focusSessionId(row.reference));
    if (sessionIds.length) await tx.delete(pomodoroSessions).where(and(
      eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.state, "completed"), inArray(pomodoroSessions.id, sessionIds),
    ));
    await tx.delete(studyEvents).where(selected);
    return { removed: rows.length };
  });
}

export async function correctFocusMinutes(userId: number, eventId: number, minutes: number) {
  const db = await database();
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = and(eq(studyEvents.userId, userId), eq(studyEvents.id, eventId), eq(studyEvents.eventType, "pomodoro_complete"));
    const [event] = await tx.select({ reference: studyEvents.referenceId }).from(studyEvents).where(owned).for("update");
    if (!event) throw new Error("الجلسة مش موجودة.");
    const sessionIds = focusSessionId(event.reference);
    if (sessionIds.length) await tx.update(pomodoroSessions).set({ completedMinutes: minutes }).where(and(
      eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.state, "completed"), inArray(pomodoroSessions.id, sessionIds)));
    await tx.update(studyEvents).set({ durationMinutes: minutes }).where(owned);
  });
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
    const sessionIds = rows.flatMap(row => focusSessionId(row.reference));
    await tx.update(studyEvents).set({ subjectId }).where(selected);
    if (sessionIds.length) await tx.update(pomodoroSessions).set({ subjectId })
      .where(and(eq(pomodoroSessions.userId, userId), inArray(pomodoroSessions.id, sessionIds)));
    return { updated: rows.length };
  });
}


export async function upcomingExamReviews(userId: number) {
  const db = await database();
  const upcoming = await upcomingExamOccurrences(userId, Infinity);
  if (!upcoming.length) return [];
  const scheduled = new Map(upcoming.map(exam => [exam.id, exam.scheduledAt]));
  const selectedLesson = db.select({ id: examLessons.lessonId }).from(examLessons)
    .where(and(eq(examLessons.examId, exams.id), eq(examLessons.lessonId, lessons.id)));
  const hasSelectedLessons = db.select({ id: examLessons.lessonId }).from(examLessons)
    .where(eq(examLessons.examId, exams.id));
  const rows = await db.select({
    id: lessons.id, title: lessons.title, subject: subjects.title,
    examTitle: exams.title, examId: exams.id, scheduledAt: exams.scheduledAt,
  }).from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
    .innerJoin(subjects, eq(subjects.id, chapters.subjectId))
    .innerJoin(exams, and(
      eq(exams.userId, userId),
      isNull(exams.archivedAt),
      inArray(exams.id, Array.from(scheduled.keys())),
    ))
    .where(and(
      or(
        exists(selectedLesson),
        and(notExists(hasSelectedLessons), or(
          eq(exams.lessonId, lessons.id),
          and(isNull(exams.lessonId), eq(exams.chapterId, chapters.id)),
          and(isNull(exams.lessonId), isNull(exams.chapterId), eq(exams.subjectId, subjects.id)),
        )),
      ),
      eq(subjects.userId, userId),
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.status, "completed"),
      isNull(lessonProgress.lastReviewedAt),
      isNull(lessons.deletedAt),
    ))
    .orderBy(exams.scheduledAt, exams.id, lessons.id);

  const byLesson = new Map<number, (typeof rows)[number]>();
  const ordered = rows.map(row => ({ ...row, scheduledAt: scheduled.get(row.examId)! }))
    .sort((a, b) => +a.scheduledAt - +b.scheduledAt);
  for (const row of ordered) {
    if (!byLesson.has(row.id)) byLesson.set(row.id, row);
  }
  return Array.from(byLesson.values());
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
    const [receipt] = await tx.select({ id: coinTransactions.id }).from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), like(coinTransactions.referenceKey, prefix + "%"))).limit(1);
    if (receipt) return { alreadySynced: true, amount: 0 };

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
  difficulty: "easy" | "medium" | "hard"; missedTopics: string[]; completedAt: Date; takenOn?: string;
}) {
  if (input.takenOn && input.takenOn > yearReviewDate(+input.completedAt)) throw new Error("تاريخ الأداء لازم يكون قبل التسجيل أو في نفس اليوم.");
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
      difficulty: input.difficulty, completionRewarded: true, createdAt: input.completedAt, takenOn: input.takenOn,
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

async function lockedPlanner(tx: StudyTransaction, userId: number) {
  await tx.insert(studyPlanner).values({ id: userId, state: emptyPlanner })
    .onDuplicateKeyUpdate({ set: { id: userId } });
  const [row] = await tx.select().from(studyPlanner).where(eq(studyPlanner.id, userId)).for("update");
  return row.state;
}

async function changeStudyBreak(tx: StudyTransaction, userId: number, now: Date, minutes?: number) {
  const planner = await lockedPlanner(tx, userId);
  const active = planner.activeBreak;
  if (minutes !== undefined) {
    if (active) return;
    await tx.update(pomodoroSessions).set({ state: "paused", pausedAt: now })
      .where(and(eq(pomodoroSessions.userId, userId), eq(pomodoroSessions.state, "running")));
    const videos = await tx.select().from(studyVideoSessions)
      .where(and(eq(studyVideoSessions.userId, userId), eq(studyVideoSessions.phase, "watching"))).for("update");
    for (const item of videos) {
      const activeSeconds = item.sourceMode === "external" ? externalVideoElapsed(item, +now) : item.activeSeconds;
      const completedBlocks = Math.max(item.completedBlocks, Math.floor(activeSeconds / videoBlockSeconds));
      await awardVideoBlocks(tx, item, completedBlocks);
      await tx.update(studyVideoSessions).set({
        activeSeconds, completedBlocks, phase: "break", timerRunning: false, lastPlaybackAt: null,
        breakEndsAt: new Date(+now + minutes * 60_000),
      }).where(eq(studyVideoSessions.id, item.id));
    }
    planner.activeBreak = { startedAt: +now, targetAt: +now + minutes * 60_000 };
  } else {
    if (!active) return;
    addBreakTime(planner.breakMilliseconds ??= {}, active.startedAt, +now);
    delete planner.activeBreak;
    await tx.update(studyVideoSessions).set({ phase: "watching", breakEndsAt: null, lastPlaybackAt: null })
      .where(and(eq(studyVideoSessions.userId, userId), eq(studyVideoSessions.phase, "break")));
  }
  await tx.update(studyPlanner).set({ state: planner }).where(eq(studyPlanner.id, userId));
}

export async function studyBreak(userId: number) {
  return (await getPlanner(userId)).activeBreak ?? null;
}

export async function setStudyBreak(userId: number, minutes?: number) {
  const db = await database();
  await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const now = new Date();
    await changeStudyBreak(tx, userId, now, minutes);
  });
}

async function changePlanner<T>(userId: number, change: (state: PlannerState, tx: Parameters<Parameters<Awaited<ReturnType<typeof database>>["transaction"]>[0]>[0]) => Promise<T>) {
  const db = await database();
  return db.transaction(async tx => {
    const state = await lockedPlanner(tx, userId);
    const before = structuredClone(state.studySessions ?? []);
    const history = state.studyHistory;
    const result = await change(state, tx);
    if (history === state.studyHistory) {
      const previous = new Map(before.map(item => [item.id, item]));
      const current = new Map((state.studySessions ?? []).map(item => [item.id, item]));
      const ids = Array.from(new Set([...Array.from(previous.keys()), ...Array.from(current.keys())]));
      const changes = ids.flatMap(id => {
        const prior = previous.get(id) ?? null;
        const next = current.get(id) ?? null;
        return sameStudyEntry(prior, next) ? [] : [{ id, before: prior, after: next }];
      });
      if (changes.length) state.studyHistory = [{ at: Date.now(), changes }, ...(history ?? [])].slice(0, 25);
    }
    await tx.update(studyPlanner).set({ state }).where(eq(studyPlanner.id, userId));
    return result;
  });
}

function sameStudyEntry(a: PlannedStudy | null, b: PlannedStudy | null) {
  if (!a || !b) return a === b;
  return a.id === b.id && a.day === b.day && a.start === b.start && a.end === b.end && a.title === b.title &&
    a.kind === b.kind && a.lessonId === b.lessonId && a.taskId === b.taskId && a.done === b.done && a.postponeReason === b.postponeReason;
}

export function undoLastStudyChange(userId: number, at: number) {
  return changePlanner(userId, async state => {
    const history = state.studyHistory ?? [];
    const latest = history[0];
    if (!latest || latest.at !== at || latest.reverted) throw new Error("السجل اتغيّر. حدّث الصفحة وجرّب تاني.");
    const sessions = new Map((state.studySessions ?? []).map(item => [item.id, item]));
    // Completion can create rewards and other progress, so keep its history read-only.
    if (latest.changes.some(change => !sameStudyEntry(sessions.get(change.id) ?? null, change.after) ||
      Boolean(change.before?.done) !== Boolean(change.after?.done))) throw new Error("التعديل ده مش متاح للتراجع.");
    for (const change of latest.changes) {
      if (change.before) sessions.set(change.id, change.before);
      else sessions.delete(change.id);
    }
    state.studySessions = Array.from(sessions.values());
    state.studyHistory = [{ ...latest, reverted: true }, ...history.slice(1)];
  });
}

export async function saveExternalVideoPosition(userId: number, sessionId: number, seconds: number) {
  const db = await database();
  await db.update(studyVideoSessions).set({ lastPlaybackPosition: seconds }).where(and(
    eq(studyVideoSessions.userId, userId), eq(studyVideoSessions.id, sessionId), eq(studyVideoSessions.sourceMode, "external"),
  ));
}

export function logSleep(userId: number, input: SleepLog & { day: string }) {
  if (input.day !== plannerToday()) throw new Error("راجع تاريخ اليوم وحدّث الصفحة.");
  const duration = sleepDuration(input);
  if (duration <= 0 || duration >= 20 * 60) throw new Error("راجع وقت النوم والصحيان.");
  return changePlanner(userId, async state => {
    (state.sleepLogs ??= {})[input.day] = { bed: input.bed, wake: input.wake };
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
    if (slot.everyOtherWeekFrom && plannerWeekday(slot.everyOtherWeekFrom) !== slot.weekday) {
      throw new Error("تاريخ أول حصة لازم يوافق يوم الموعد.");
    }
    state.slots = [...state.slots.filter(item => item.id !== slot.id), { ...slot, dateOverrides: previous?.dateOverrides }];
  });
}

export function removePlannerSlot(userId: number, slotId: string) {
  return changePlanner(userId, async state => {
    state.slots = state.slots.filter(slot => slot.id !== slotId);
  });
}

export async function attendPlannerClass(userId: number, input: { slotId: string; day: string; lessonIds: number[] }) {
  const { cycle, rows } = await listStudyPlan(userId);
  const completed = await changePlanner(userId, async (state, tx) => {
    const previous = state.attendance.filter(item => item.slotId === input.slotId && item.day === input.day);
    if (previous.length) return false;
    const slot = state.slots.find(item => item.id === input.slotId);
    if (!slot?.subjectId || !slotOccurs(slot, input.day) || input.day > plannerToday()) {
      throw new Error("اختار تاريخ حصة موجودة في الجدول.");
    }
    const subjectRows = rows.filter(row => row.subject.id === slot.subjectId && row.lesson);
    const subject = subjectRows[0]?.subject;
    if (!subject) throw new Error("أضف دروس للمادة في خطة المنهج الأول.");
    const attended = new Set(state.attendance.map(item => item.lessonId));
    const policy = plannerPolicy(subject.title);
    const selectedIds = new Set(input.lessonIds);
    const next = subjectRows.filter(row => selectedIds.has(row.lesson!.id));
    if (!next.length || next.length !== input.lessonIds.length) {
      throw new Error("اختار الدروس اللي اتشرحت من نفس مادة الحصة.");
    }

    if (next.some(row => !state.resources?.homework.some(item => item.lessonId === row.lesson!.id))) {
      throw new Error("احفظ تفاصيل واجب الحصة الأول، وبعدها أكّد الحضور.");
    }

    const nextSlot = Array.from({ length: 15 }, (_, index) => shiftPlannerDay(input.day, index))
      .flatMap(day => state.slots.filter(item => item.subjectId === subject.id && slotOccurs(item, day))
        .filter(item => day > input.day || item.start > slot.start)
        .map(item => ({ day, start: item.start })))
      .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start))[0];
    const deadline = nextSlot ? cairoPlannerTime(nextSlot.day, nextSlot.start) : null;
    const sources = await tx.select().from(lessonSources).where(and(eq(lessonSources.userId, userId),
      eq(lessonSources.delivery, "hybrid"), eq(lessonSources.active, true)));
    for (const source of hybridHomeworkSources(sources, subject.title, slot.sourceId)) {
      await saveHybridHomework(tx, state, userId, cycle.id, {
        key: hybridHomeworkKey(slot.id, input.day, source.id), day: input.day, subject: subject.title,
        lessonTitles: next.map(row => row.lesson!.title), source,
      }, deadline);
    }
    const previousClasses = new Set(state.attendance.filter(item => item.subjectId === subject.id).map(item => item.slotId + item.day)).size;
    for (const row of next) {
      const lesson = row.lesson!;
      state.attendance.push({ slotId: slot.id, day: input.day, subjectId: subject.id, lessonId: lesson.id, lessonTitle: lesson.title });
      attended.add(lesson.id);
      for (const item of state.resources?.homework.filter(item => item.lessonId === lesson.id) ?? []) {
        await publishLessonHomework(tx, state, userId, cycle.id, item, lesson.title, input.day, deadline);
      }
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
    for (const row of next) await completeLessonInTransaction(tx, userId, row.lesson!.id, new Date());
    if (state.backlog) {
      for (const id of state.backlog.filter(id => selectedIds.has(id))) (state.finishedBacklog ??= {})[id] = plannerToday();
      state.backlog = state.backlog.filter(id => !selectedIds.has(id));
    }
    return true;
  });
  if (completed) await evaluateAchievements(userId, cycle.id).catch(() => []);
  return { missingHomework: [] };
}

type HybridHomework = {
  key: string;
  day: string;
  subject: string;
  lessonTitles: string[];
  source: Pick<typeof lessonSources.$inferSelect, "teacherName" | "platform" | "url">;
};

function hybridHomeworkKey(slotId: string, day: string, sourceId: number) {
  return [slotId, day, sourceId].join(":");
}

async function saveHybridHomework(tx: StudyTransaction, state: PlannerState, userId: number, cycleId: number,
  entry: HybridHomework, deadline: Date | null, watched = false) {
  const published = state.hybridHomework ??= {};
  if (published[entry.key]) return;
  const link = entry.source.url && safeStudyUrl(entry.source.url);
  const [result] = await tx.insert(tasks).values({
    userId, cycleId, category: "واجب", scheduledFor: entry.day, deadline,
    title: ("شاهد محاضرة الأونلاين · " + entry.subject + " · " + entry.source.teacherName).slice(0, 200),
    description: ["الدروس: " + entry.lessonTitles.join("، "), "المصدر: " + entry.source.platform, link].filter(Boolean).join("\n"),
    status: watched ? "completed" : "open", completedAt: watched ? new Date() : null,
  });
  published[entry.key] = result.insertId;
}

function historicalHybridHomework(state: PlannerState, subjectRows: (typeof subjects.$inferSelect)[],
  sources: (typeof lessonSources.$inferSelect)[]) {
  if (state.hybridHomeworkReviewed) return [];
  const entries = new Map<string, HybridHomework>();
  const names = new Map(subjectRows.map(subject => [subject.id, subject.title]));
  const slots = new Map(state.slots.map(slot => [slot.id, slot]));
  for (const item of state.attendance) {
    const subject = names.get(item.subjectId);
    if (!subject) continue;
    for (const source of hybridHomeworkSources(sources, subject, slots.get(item.slotId)?.sourceId)) {
      const key = hybridHomeworkKey(item.slotId, item.day, source.id);
      if (state.hybridHomework?.[key]) continue;
      const entry = entries.get(key) ?? { key, day: item.day, subject, lessonTitles: [], source };
      if (!entry.lessonTitles.includes(item.lessonTitle)) entry.lessonTitles.push(item.lessonTitle);
      entries.set(key, entry);
    }
  }
  return Array.from(entries.values()).sort((a, b) => a.subject.localeCompare(b.subject, "ar") || a.day.localeCompare(b.day));
}

async function hybridReviewInputs(userId: number) {
  const db = await database();
  return Promise.all([
    db.select().from(subjects).where(eq(subjects.userId, userId)),
    db.select().from(lessonSources).where(and(eq(lessonSources.userId, userId),
      eq(lessonSources.delivery, "hybrid"), eq(lessonSources.active, true))),
  ]);
}

export async function pendingHybridHomeworkReview(userId: number) {
  const state = await getPlanner(userId);
  if (state.hybridHomeworkReviewed) return [];
  return historicalHybridHomework(state, ...await hybridReviewInputs(userId));
}

export async function finishHybridHomeworkReview(userId: number, answers: { key: string; watched: boolean }[]) {
  const [cycle, inputs] = await Promise.all([getActiveCycle(userId), hybridReviewInputs(userId)]);
  return changePlanner(userId, async (state, tx) => {
    if (state.hybridHomeworkReviewed) return;
    const entries = historicalHybridHomework(state, ...inputs);
    const watched = new Map(answers.map(answer => [answer.key, answer.watched]));
    if (watched.size !== answers.length || entries.length !== answers.length || entries.some(entry => !watched.has(entry.key))) {
      throw new Error("قائمة المحاضرات اتغيّرت. حدّث الصفحة وراجع الاختيارات.");
    }
    for (const entry of entries) await saveHybridHomework(tx, state, userId, cycle.id, entry, null, watched.get(entry.key));
    state.hybridHomeworkReviewed = true;
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

export function markBacklog(userId: number, lessonIds: number[], marked: boolean) {
  return changePlanner(userId, async (state, tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const ids = new Set(state.backlog ?? []);
    for (const lessonId of lessonIds) {
      await ownedLesson(tx, userId, lessonId);
      if (marked) {
        ids.add(lessonId);
        await tx.update(lessonProgress).set({ status: "not_started", progress: 0, completedAt: null, lastReviewedAt: null })
          .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId), eq(lessonProgress.status, "completed")));
      } else ids.delete(lessonId);
    }
    state.backlog = Array.from(ids);
  });
}

export function setTeacherNext(userId: number, subjectId: number, lessonId?: number) {
  return changePlanner(userId, async (state, tx) => {
    if (lessonId !== undefined) {
      const lesson = await ownedLesson(tx, userId, lessonId);
      if (lesson.subjectId !== subjectId) throw new Error("الدرس تابع لمادة تانية.");
    }
    state.teacherNext ??= {};
    if (lessonId === undefined) delete state.teacherNext[subjectId];
    else state.teacherNext[subjectId] = lessonId;
  });
}

export function chooseBacklogSubject(userId: number, subjectId: number) {
  return changePlanner(userId, async (state, tx) => {
    const [subject] = await tx.select({ id: subjects.id }).from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)));
    if (!subject) throw new Error("المادة مش موجودة.");
    const day = plannerToday();
    if (state.slots.some(slot => slotOccurs(slot, day) && slot.subjectId)) {
      throw new Error("فيه حصص مجدولة النهارده.");
    }
    state.backlogSubjects ??= {};
    for (const prior of Object.keys(state.backlogSubjects)) {
      if (prior < shiftPlannerDay(day, -30)) delete state.backlogSubjects[prior];
    }
    state.backlogSubjects[day] = subjectId;
  });
}

export async function reopenTask(userId: number, taskId: number) {
  const db = await database();
  await db.update(tasks).set({ status: "open", completedAt: null })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt), eq(tasks.status, "completed")));
}

export async function reopenLesson(userId: number, lessonId: number) {
  const db = await database();
  await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await ownedLesson(tx, userId, lessonId);
    await tx.update(lessonProgress).set({ status: "not_started", progress: 0, completedAt: null, lastReviewedAt: null })
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId), eq(lessonProgress.status, "completed")));
  });
}

type RescheduledStudy = { id: string; day: string; start: string; end: string };

async function suggestReplan(tx: Pick<StudyTransaction, "select">, userId: number, state: PlannerState) {
  const day = plannerToday();
  const now = new Date();
  const delayed = (state.studySessions ?? []).filter(item => item.day === day && !item.done && cairoPlannerTime(day, item.end) <= now)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!delayed.length) return { changes: [], left: [] };
  const tomorrow = shiftPlannerDay(day, plannerWeekday(shiftPlannerDay(day, 1)) === 5 ? 2 : 1);
  const upcoming = examOccurrences(await scheduledExamRows(tx, userId), day, shiftPlannerDay(day, 7), state.slots)
    .filter(exam => exam.scheduledAt > now);
  const dueByExam = new Map<number, number>();
  for (const exam of upcoming) {
    dueByExam.set(exam.id, Math.min(dueByExam.get(exam.id) ?? Infinity, +exam.scheduledAt));
  }
  const links = dueByExam.size ? await tx.select({ examId: examLessons.examId, lessonId: examLessons.lessonId })
    .from(examLessons).where(inArray(examLessons.examId, Array.from(dueByExam.keys()))) : [];
  const deadlineByLesson = new Map<number, number>();
  for (const link of links) {
    deadlineByLesson.set(link.lessonId, Math.min(deadlineByLesson.get(link.lessonId) ?? Infinity, dueByExam.get(link.examId)!));
  }
  const deadline = (item: typeof delayed[number]) => deadlineByLesson.get(item.lessonId ?? 0) ?? Number.MAX_SAFE_INTEGER;
  const prioritized = delayed.sort((a, b) => deadline(a) - deadline(b)).slice(0, 20);
  const ids = new Set(prioritized.map(item => item.id));
  const fixed = { ...state, studySessions: state.studySessions?.filter(item => !ids.has(item.id)) };
  const [todayFree, tomorrowFree] = await Promise.all([
    studyAvailability(tx, userId, fixed, day), studyAvailability(tx, userId, fixed, tomorrow),
  ]);
  const changes: (RescheduledStudy & { title: string })[] = [];
  const left: string[] = [];
  const clock = (minutes: number) => [Math.floor(minutes / 60), minutes % 60].map(part => String(part).padStart(2, "0")).join(":");
  for (const item of prioritized) {
    const duration = plannerMinutes(item.end) - plannerMinutes(item.start);
    const fits = (date: string) => (gap: { start: number; end: number }) => gap.end - gap.start >= duration
      && +cairoPlannerTime(date, clock(gap.start)) + duration * 60_000 <= deadline(item);
    const today = todayFree.free.find(fits(day));
    const gap = today ?? tomorrowFree.free.find(fits(tomorrow));
    if (!gap) { left.push(item.title); continue; }
    changes.push({ id: item.id, title: item.title, day: today ? day : tomorrow, start: clock(gap.start), end: clock(gap.start + duration) });
    gap.start += duration;
  }
  return { changes, left };
}

async function proposeStudyWeek(tx: Pick<StudyTransaction, "select">, userId: number, state: PlannerState, budget: number) {
  const today = plannerToday();
  const dates = Array.from({ length: 7 }, (_, index) => shiftPlannerDay(today, index))
    .filter(day => plannerWeekday(day) !== 5);
  const [plan, examRows, homework] = await Promise.all([
    listStudyPlan(userId), scheduledExamRows(tx, userId),
    tx.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.category, "واجب"),
      eq(tasks.status, "open"), isNull(tasks.deletedAt))),
  ]);
  const now = Date.now();
  const visits = examOccurrences(examRows, today, shiftPlannerDay(today, 6), state.slots)
    .filter(exam => +exam.scheduledAt > now);
  const ids = Array.from(new Set(visits.map(exam => exam.id)));
  const links = ids.length ? await tx.select({ examId: examLessons.examId, lessonId: examLessons.lessonId })
    .from(examLessons).where(inArray(examLessons.examId, ids)) : [];
  const queued = new Set((state.studySessions ?? []).filter(item => !item.done && item.day >= today).map(item => item.lessonId));
  const marked = new Set(state.backlog ?? []);
  const candidates = plan.rows.flatMap(row => {
    if (!row.lesson || queued.has(row.lesson.id)) return [];
    const lesson = row.lesson;
    const deadline = visits.reduce((next, exam) => {
      const scope = links.filter(link => link.examId === exam.id);
      const covered = scope.length ? scope.some(link => link.lessonId === lesson.id)
        : exam.lessonId ? exam.lessonId === lesson.id
        : exam.chapterId ? exam.chapterId === row.chapter?.id
        : exam.subjectId === row.subject.id;
      return covered ? Math.min(next, +exam.scheduledAt) : next;
    }, Infinity);
    const complete = row.progress?.status === "completed";
    if (complete && (!Number.isFinite(deadline) || row.progress?.lastReviewedAt)) return [];
    const kind = complete ? "review" as const : marked.has(lesson.id) ? "backlog" as const : "study" as const;
    return [{ title: lesson.title, lessonId: lesson.id, kind, deadline,
      duration: kind === "review" ? 15 : Math.max(5, lesson.estimatedMinutes) }];
  });
  const plannedHomework = new Set((state.studySessions ?? []).filter(item => !item.done && item.day >= today).map(item => item.taskId));
  const weekEnd = shiftPlannerDay(today, 6);
  const homeworkCandidates = homework.filter(task => !plannedHomework.has(task.id) &&
    (task.deadline ? plannerToday(task.deadline) <= weekEnd : !task.scheduledFor || task.scheduledFor <= weekEnd))
    .map(task => ({ title: task.title, taskId: task.id, kind: "homework" as const, duration: 25,
      deadline: task.deadline && +task.deadline > now ? +task.deadline : Infinity,
      priority: task.priority === "urgent" ? 0 : 1 } as const));
  const urgent = [...candidates, ...homeworkCandidates].filter(item => Number.isFinite(item.deadline)).sort((a, b) => a.deadline - b.deadline);
  const backlog = candidates.filter(item => !Number.isFinite(item.deadline) && item.kind === "backlog");
  const other = candidates.filter(item => !Number.isFinite(item.deadline) && item.kind !== "backlog");
  const flexibleHomework = homeworkCandidates.filter(item => !Number.isFinite(item.deadline)).sort((a, b) => a.priority - b.priority);
  const order = [...urgent, ...Array.from({ length: Math.max(backlog.length, other.length, flexibleHomework.length) },
    (_, i) => [flexibleHomework[i], other[i], backlog[i]]).flat().filter(Boolean)];
  const slots = await Promise.all(dates.map(async day => ({ day, assigned: 0, ...(await studyAvailability(tx, userId, state, day)) })));
  const entries: Omit<PlannedStudy, "id">[] = [];
  let remaining = budget;
  for (const item of order) {
    if (remaining < 5 || entries.length >= 40) break;
    const duration = Math.min(remaining, item.duration);
    const rankedDays = Number.isFinite(item.deadline) ? slots : [...slots].sort((a, b) => a.assigned - b.assigned);
    for (const slot of rankedDays) {
      const { day, free } = slot;
      const gap = free.find(period => period.end - period.start >= duration &&
        +cairoPlannerTime(day, examClock(period.start)) + duration * 60_000 <= item.deadline);
      if (!gap) continue;
      entries.push({ day, start: examClock(gap.start), end: examClock(gap.start + duration), ...("lessonId" in item ? { lessonId: item.lessonId } : { taskId: item.taskId }), title: item.title, kind: item.kind });
      gap.start += duration;
      remaining -= duration;
      slot.assigned += duration;
      break;
    }
  }
  return { entries, remaining };
}

export async function previewStudyWeek(userId: number, budget: number) {
  const db = await database();
  return proposeStudyWeek(db, userId, await getPlanner(userId), budget);
}

export function applyStudyWeek(userId: number, budget: number, signature: string) {
  return changePlanner(userId, async (state, tx) => {
    const preview = await proposeStudyWeek(tx, userId, state, budget);
    if (signature !== JSON.stringify(preview.entries) || !preview.entries.length) {
      throw new Error("الوقت المتاح اتغيّر. اعمل معاينة تاني قبل الاعتماد.");
    }
    (state.studySessions ??= []).push(...preview.entries.map(entry => ({ ...entry, id: crypto.randomUUID() })));
    return { added: preview.entries.length };
  });
}

export async function previewStudyReplan(userId: number) {
  const db = await database();
  return suggestReplan(db, userId, await getPlanner(userId));
}

export function applyStudyReplan(userId: number, changes: RescheduledStudy[]) {
  return changePlanner(userId, async (state, tx) => {
    const preview = await suggestReplan(tx, userId, state);
    const match = (a: RescheduledStudy, b: RescheduledStudy) =>
      a.id === b.id && a.day === b.day && a.start === b.start && a.end === b.end;
    if (changes.some(change => !preview.changes.some(item => match(change, item)))) {
      throw new Error("الجدول اتغيّر. افتح الاقتراح من جديد.");
    }
    const moves = new Map(changes.map(item => [item.id, item]));
    state.studySessions = state.studySessions?.map(item => {
      const move = moves.get(item.id);
      return move ? { ...item, ...move, postponeReason: "not_enough_time" as const } : item;
    });
  });
}

export function savePlannedStudy(userId: number, input: PlannedStudy) {
  return changePlanner(userId, async (state, tx) => {
    if (input.start >= input.end) throw new Error("النهاية لازم تبقى بعد البداية.");
    const sessions = state.studySessions ?? [];
    const previous = sessions.find(item => item.id === input.id);
    if (previous?.done) throw new Error("المذاكرة دي خلصت بالفعل.");
    if (input.postponeReason && (
      !previous || input.day < plannerToday() || input.day + input.start <= previous.day + previous.start
    )) throw new Error("اختار ميعاد بعد الميعاد الأصلي ومن النهارده فصاعدًا.");
    if (input.lessonId) {
      if (input.lessonId > 0) await ownedLesson(tx, userId, input.lessonId);
      else if (!previous || previous.lessonId !== input.lessonId) throw new Error("التقييم مش موجود في خطة اليوم.");
      if (sessions.some(item => item.id !== input.id && item.lessonId === input.lessonId && !item.done)) {
        throw new Error("الدرس ده متضاف بالفعل لخطة المذاكرة.");
      }
    }
    const start = plannerMinutes(input.start);
    const end = plannerMinutes(input.end);
    const busy = [...state.slots.filter(slot => slotOccurs(slot, input.day)), ...studySlots(state, input.day).filter(slot => slot.id !== input.id)];
    const gaps = plannerFreeTime(state.wake, state.sleep, busy);
    if (!gaps.some(gap => gap.start <= start && gap.end >= end)) throw new Error("اختار وقت فاضي بين الصحوة والنوم.");
    const from = cairoPlannerTime(input.day, input.start);
    const to = cairoPlannerTime(input.day, input.end);
    const events = await tx.select().from(calendarEvents)
      .where(and(eq(calendarEvents.userId, userId), lte(calendarEvents.startsAt, to)));
    if (events.some(item => item.startsAt < to && (item.endsAt ? item.endsAt > from : item.startsAt >= from))) {
      throw new Error("الوقت ده فيه موعد في التقويم.");
    }
    const examsInDay = examOccurrences(await scheduledExamRows(tx, userId), shiftPlannerDay(input.day, -1), input.day, state.slots);
    if (examsInDay.some(exam => exam.scheduledAt < to && exam.endAt > from)) throw new Error("فيه امتحان في الوقت ده. راجع التقويم.");
    const postponeReason = input.postponeReason ?? previous?.postponeReason;
    state.studySessions = [...sessions.filter(item => item.id !== input.id), { ...input, postponeReason }];
  });
}

export function reopenPlannedStudy(userId: number, id: string) {
  return changePlanner(userId, async state => {
    const session = state.studySessions?.find(item => item.id === id);
    if (!session) throw new Error("الجلسة مش موجودة.");
    session.done = false;
  });
}

export async function finishPlannedStudy(userId: number, id: string) {
  const cycle = await getActiveCycle(userId);
  const lessonCycle = await changePlanner(userId, async (state, tx) => {
    const session = state.studySessions?.find(item => item.id === id);
    if (!session || session.done) return;
    let completedLessonCycle: number | undefined;
    if (session.kind === "backlog" && session.lessonId) {
      if (session.lessonId < 0) {
        await applyAssessmentStatus(tx, state, userId, cycle.id, -session.lessonId, "completed");
        return;
      }
      const result = await completeLessonInTransaction(tx, userId, session.lessonId, new Date());
      if (!result.alreadyCompleted) completedLessonCycle = result.cycleId;
    }
    session.done = true;
    await awardPlannerCoins(tx, userId, cycle.id, "planned_study_complete", "session:" + id, "إكمال جلسة: " + session.title);
    return completedLessonCycle;
  });
  if (lessonCycle !== undefined) await evaluateAchievements(userId, lessonCycle);
}

export async function finishYearReview(userId: number, input: { subjectId: number; day: string }) {
  const today = plannerToday();
  if (input.day > today) throw new Error("سجّل المراجعة في يومها أو بعده.");
  const { cycle, rows } = await listStudyPlan(userId);
  const subjectRows = rows.filter(row => row.subject.id === input.subjectId && row.lesson);
  if (!subjectRows.length || subjectRows.some(row => row.progress?.status !== "completed" || !row.progress.completedAt)) {
    throw new Error("مراجعة آخر السنة تبدأ بعد إكمال المادة.");
  }
  const completedAt = Math.max(...subjectRows.map(row => +row.progress!.completedAt!));
  if (!buildYearReviews(yearReviewDate(completedAt), subjectRows.length, input.day).some(session => session.day === input.day)) {
    throw new Error("جلسة المراجعة دي مش موجودة في الجدول.");
  }
  return changePlanner(userId, async (state, tx) => {
    const completed = state.completedYearReviews ??= [];
    const key = input.subjectId + ":" + input.day;
    if (completed.includes(key)) return;
    await awardPlannerCoins(tx, userId, cycle.id, "year_review_complete", "year:" + key, "مراجعة آخر السنة: " + subjectRows[0].subject.title);
    completed.push(key);
  });
}

export function removePlannedStudy(userId: number, id: string) {
  return changePlanner(userId, async state => {
    state.studySessions = state.studySessions?.filter(item => item.id !== id);
  });
}

export function overridePlannerSlot(userId: number, id: string, day: string, active: boolean) {
  return changePlanner(userId, async state => {
    const slot = state.slots.find(item => item.id === id);
    if (!slot || plannerWeekday(day) !== slot.weekday) throw new Error("الموعد ده مش موجود في اليوم المختار.");
    if (!active && state.attendance.some(item => item.slotId === id && item.day === day)) {
      throw new Error("الحصة دي اتسجّل حضورها بالفعل.");
    }
    slot.dateOverrides ??= {};
    slot.dateOverrides[day] = active;
  });
}

export function fillStudyDay(userId: number, day: string, subjectId: number) {
  return changePlanner(userId, async (state, tx) => {
    const [subject] = await tx.select({ title: subjects.title }).from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)));
    if (!subject) throw new Error("المادة مش موجودة.");
    const from = cairoPlannerTime(day, state.wake);
    const to = cairoPlannerTime(day, state.sleep);
    const events = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId),
      lte(calendarEvents.startsAt, to), or(gte(calendarEvents.startsAt, from), gte(calendarEvents.endsAt, from))));
    const examsInDay = examOccurrences(await scheduledExamRows(tx, userId), shiftPlannerDay(day, -1), day, state.slots)
      .filter(exam => exam.scheduledAt < to && exam.endAt > from);
    const time = (minutes: number) => [Math.floor(minutes / 60), minutes % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
    const minuteOf = (date: Date) => plannerMinutes(state.wake) + Math.floor((+date - +from) / 60_000);
    const weekday = plannerWeekday(day);
    const busy = [...state.slots.filter(slot => slotOccurs(slot, day)), ...studySlots(state, day)];
    for (const exam of examsInDay) busy.push({ id: "exam-" + exam.id, weekday, title: exam.title,
      start: time(Math.max(plannerMinutes(state.wake), minuteOf(exam.scheduledAt))),
      end: time(Math.min(plannerMinutes(state.sleep), minuteOf(exam.endAt))) });
    for (const event of events) {
      if (!event.endsAt || event.endsAt <= event.startsAt) {
        throw new Error("فيه موعد من غير وقت نهاية. ضيف المذاكرة بوقت محدد من خطة اليوم.");
      }
      busy.push({ id: "event-" + event.id, weekday, title: event.title,
        start: time(Math.max(plannerMinutes(state.wake), minuteOf(event.startsAt))),
        end: time(Math.min(plannerMinutes(state.sleep), minuteOf(event.endsAt))) });
    }
    const times = await cairoPrayers(day);
    for (const prayer of prayers) {
      const start = times[prayer];
      busy.push({ id: "prayer-" + prayer, title: prayerNames[prayer], weekday, start,
        end: time(Math.min(1440, plannerMinutes(start) + 60)) });
    }
    const gaps = plannerFreeTime(state.wake, state.sleep, busy);
    if (!gaps.length) throw new Error("مفيش وقت فاضي في اليوم ده.");
    state.studySessions = [...(state.studySessions ?? []), ...gaps.map(({ start, end }): PlannedStudy => ({
      id: crypto.randomUUID(), day, start: time(start), end: time(end), title: subject.title, kind: "study",
    }))];
    return gaps.length;
  });
}

type DailyPlanInput = { count: number; reserve: number; budget: number; exclude: number[]; subjectId?: number };

async function studyAvailability(tx: Pick<StudyTransaction, "select">, userId: number, state: PlannerState, day: string) {
  const from = cairoPlannerTime(day, state.wake);
  const to = cairoPlannerTime(day, state.sleep);
  const events = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId),
    lte(calendarEvents.startsAt, to), or(gte(calendarEvents.startsAt, from), gte(calendarEvents.endsAt, from))));
  const assessments = examOccurrences(await scheduledExamRows(tx, userId), shiftPlannerDay(day, -1), shiftPlannerDay(day, 7), state.slots);
  const minuteOf = (value: Date) => plannerMinutes(state.wake) + Math.ceil((+value - +from) / 60_000);
  const gaps = plannerFreeTime(state.wake, state.sleep, [...state.slots.filter(slot => slotOccurs(slot, day)), ...studySlots(state, day)])
    .map(gap => ({ start: day === plannerToday() ? Math.max(gap.start, minuteOf(new Date())) : gap.start, end: gap.end }));
  const prayerTimes = await cairoPrayers(day).catch(() => null);
  const prayerBlocks = prayerTimes ? prayers.map(prayer => {
    const start = plannerMinutes(prayerTimes[prayer]);
    return { start, end: start + 60 };
  }) : [];
  const blocked = events.map(event => ({
    start: minuteOf(event.startsAt),
    end: event.endsAt ? minuteOf(event.endsAt) : plannerMinutes(state.sleep),
  }));
  blocked.push(...prayerBlocks);
  for (const exam of assessments) if (exam.scheduledAt < to && exam.endAt > from) {
    blocked.push({ start: minuteOf(exam.scheduledAt), end: minuteOf(exam.endAt) });
  }
  const free = blocked.reduce((periods, block) => periods.flatMap(gap =>
    block.start >= gap.end || block.end <= gap.start ? [gap] : [
      { start: gap.start, end: block.start }, { start: block.end, end: gap.end },
    ]), gaps).filter(gap => gap.end > gap.start);
  return { free, assessments };
}

async function suggestDailyStudy(tx: StudyTransaction, userId: number, state: PlannerState, rows: Awaited<ReturnType<typeof listStudyPlan>>["rows"], input: DailyPlanInput) {
  const day = plannerToday();
  const { free, assessments } = await studyAvailability(tx, userId, state, day);
  const available = free.reduce((sum, gap) => sum + gap.end - gap.start, 0);
  const queued = new Set((state.studySessions ?? []).filter(item => !item.done && item.day >= day).map(item => item.lessonId));
  const marked = new Set(state.backlog ?? []);
  const waiting = rows.filter(row => row.lesson && marked.has(row.lesson.id) && row.progress?.status !== "completed" && !queued.has(row.lesson.id))
    .map(row => ({ subject: row.subject, lesson: { id: row.lesson!.id, title: row.lesson!.title } }));
  for (const item of assessmentCatalog) {
    if (state.assessments?.[item.id] !== "backlog" || queued.has(-item.id)) continue;
    const subject = rows.find(row => row.subject.title === item.subject)?.subject;
    if (subject) waiting.push({ subject, lesson: { id: -item.id, title: item.title } });
  }
  const groups = new Map<number, { title: string; count: number }>();
  for (const row of waiting) {
    const previous = groups.get(row.subject.id);
    groups.set(row.subject.id, { title: row.subject.title, count: (previous?.count ?? 0) + 1 });
  }
  const ranked = Array.from(groups.entries()).sort((a, b) => b[1].count - a[1].count);
  const primary = input.subjectId ?? ranked[0]?.[0];
  const urgent = ranked.filter(([id]) => id !== primary).map(([id]) => {
    const days = Array.from({ length: 7 }, (_, i) => shiftPlannerDay(day, i + 1));
    const next = days.find(date => state.slots.some(slot => slot.subjectId === id && slotOccurs(slot, date)));
    const exam = assessments.find(item => item.subjectId === id && item.endAt > new Date())?.scheduledAt;
    return { id, next: Math.min(next ? +cairoPlannerTime(next, "00:00") : Infinity, exam ? +exam : Infinity) };
  }).sort((a, b) => a.next - b.next);
  const secondary = urgent[0]?.id;
  const excluded = new Set(input.exclude);
  const candidates = waiting.filter(row => !excluded.has(row.lesson!.id));
  const main = candidates.filter(row => row.subject.id === primary);
  const support = candidates.filter(row => row.subject.id === secondary);
  const order = input.subjectId ? main : [...main.slice(0, 1), ...support.slice(0, 1), ...main.slice(1),
    ...support.slice(1), ...candidates.filter(row => row.subject.id !== primary && row.subject.id !== secondary)];
  const budget = Math.max(0, Math.min(input.budget, available - input.reserve));
  const clock = (minutes: number) => [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, "0")).join(":");
  const suggestions: { lessonId: number; title: string; subject: string; start: string; end: string; reason: string }[] = [];
  const count = Math.min(input.count, order.length);
  // Give each lesson an equal share without crossing a booked period.
  let duration = Math.floor(budget / Math.max(1, count));
  while (duration >= 5 && free.reduce((sum, gap) => sum + Math.floor((gap.end - gap.start) / duration), 0) < count) {
    duration--;
  }
  for (const row of order.slice(0, count)) {
    if (duration < 5) break;
    const lesson = row.lesson!;
    const gap = free.find(period => period.end - period.start >= duration);
    if (!gap) break;
    suggestions.push({ lessonId: lesson.id, title: lesson.title, subject: row.subject.title,
      start: clock(gap.start), end: clock(gap.start + duration),
      reason: row.subject.id === primary && !input.subjectId ? "أكبر تراكم" :
        row.subject.id === secondary && Number.isFinite(urgent[0]?.next) ? "متابعة مادة لها موعد قريب" : "من المتراكم" });
    gap.start += duration;
  }
  return { day, available, suggestions, subjects: ranked.map(([id, entry]) => ({ id, ...entry })) };
}

export async function previewDailyStudy(userId: number, input: DailyPlanInput) {
  const { rows } = await listStudyPlan(userId);
  const db = await database();
  const state = await getPlanner(userId);
  return db.transaction(tx => suggestDailyStudy(tx, userId, state, rows, input));
}

export async function approveDailyStudy(userId: number, input: DailyPlanInput, day: string, expected: { lessonId: number; start: string; end: string }[]) {
  const { rows } = await listStudyPlan(userId);
  return changePlanner(userId, async (state, tx) => {
    if (day !== plannerToday() || state.dailyPrompt?.day === day) throw new Error("حدّث الصفحة عشان تشوف حالة خطة اليوم.");
    const preview = await suggestDailyStudy(tx, userId, state, rows, input);
    if (preview.suggestions.length !== expected.length || preview.suggestions.some((item, index) =>
      item.lessonId !== expected[index].lessonId || item.start !== expected[index].start || item.end !== expected[index].end)) {
      throw new Error("الوقت أو الدروس اتغيّروا. اعرض الاقتراح تاني قبل الاعتماد.");
    }
    state.studySessions = [...(state.studySessions ?? []), ...preview.suggestions.map((item): PlannedStudy => ({
      id: crypto.randomUUID(), day, title: item.title, lessonId: item.lessonId,
      start: item.start, end: item.end, kind: "backlog",
    }))];
    state.dailyPrompt = { day, outcome: "approved" };
  });
}

export function skipDailyStudy(userId: number) {
  return changePlanner(userId, async state => {
    const day = plannerToday();
    if (state.dailyPrompt?.day !== day) state.dailyPrompt = { day, outcome: "skipped" };
  });
}

export async function dailyPrayers(userId: number) {
  const day = plannerToday();
  const db = await database();
  const references = prayers.map(prayer => prayerReference(userId, day, prayer));
  const [times, completed, planner] = await Promise.all([
    cairoPrayers(day).catch(() => null),
    db.select({ reference: coinTransactions.referenceKey }).from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), inArray(coinTransactions.referenceKey, references))),
    getPlanner(userId),
  ]);
  return { day, awarded: completed.length === prayers.length, prayers: prayers.map(prayer => ({
    prayer, name: prayerNames[prayer], time: times?.[prayer] ?? null,
    endMinute: times ? prayerEndForSchedule(day, prayer, times, planner) : null,
    done: planner.prayersByDay?.[day]?.includes(prayer) || completed.some(row => row.reference === prayerReference(userId, day, prayer)),
  })) };
}

function prayerReference(userId: number, day: string, prayer: Prayer) {
  return `prayer:${userId}:${day}:${prayer}`;
}

export async function logPrayer(userId: number, day: string, prayer: Prayer, location: "home" | "mosque") {
  if (location !== (prayer === "Fajr" ? "home" : "mosque")) throw new Error("مكان الصلاة المسجّل لا يطابق شرط النقاط.");
  if (day !== plannerToday()) throw new Error("حدّث الصفحة عشان تسجّل صلاة النهارده.");
  const times = await cairoPrayers(day);
  const start = +cairoPlannerTime(day, times[prayer]);
  const cycle = await getActiveCycle(userId);
  return changePlanner(userId, async (state, tx) => {
    const endMinute = prayerEndForSchedule(day, prayer, times, state);
    const end = endMinute === 1440 ? +cairoPlannerTime(shiftPlannerDay(day, 1), "00:00")
      : start + (endMinute - plannerMinutes(times[prayer])) * 60_000;
    const now = Date.now();
    if (day !== plannerToday() || now < start || now >= end) throw new Error("وقت تسجيل الصلاة بالنقاط مش متاح دلوقتي.");
    state.prayersByDay ??= {};
    state.prayersByDay[day] = Array.from(new Set([...(state.prayersByDay[day] ?? []), prayer]));
    return settlePrayerPoints(tx, state, userId, cycle.id, day);
  });
}

export async function prayerSchedule(day: string) {
  const times = await cairoPrayers(day);
  return prayers.map(prayer => ({ prayer, name: prayerNames[prayer], time: times[prayer] }));
}

export async function awardActivityPoint(userId: number, action: string) {
  const cycle = await getActiveCycle(userId);
  const { createHash } = await import("node:crypto");
  const day = plannerToday();
  const prefix = `activity:${userId}:${day}:`;
  const referenceKey = prefix + createHash("sha256").update(action).digest("hex").slice(0, 24);
  const db = await database();
  return db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [existing] = await tx.select({ id: coinTransactions.id }).from(coinTransactions)
      .where(eq(coinTransactions.referenceKey, referenceKey));
    if (existing) return { awarded: false };
    const [daily] = await tx.select({ total: count() }).from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), like(coinTransactions.referenceKey, prefix + "%")));
    if (Number(daily?.total ?? 0) >= 100) return { awarded: false };
    await tx.insert(coinTransactions).values({ userId, cycleId: cycle.id, amount: 1,
      type: "earn", referenceKey, reason: "نشاط في الموقع" });
    return { awarded: true };
  });
}

async function applyAssessmentStatus(tx: StudyTransaction, state: PlannerState, userId: number, cycleId: number, id: number, status: AssessmentStatus) {
  if (!assessmentCatalog.some(item => item.id === id)) throw new Error("التقييم مش موجود.");
  const statuses = state.assessments ??= {};
  if (status === "completed" && statuses[id] !== "completed") {
    await awardPlannerCoins(tx, userId, cycleId, "assessment_complete", "assessment:" + id, "إكمال تقييم");
  }
  statuses[id] = status;
  for (const session of state.studySessions ?? []) {
    if (session.lessonId === -id) session.done = status === "completed";
  }
}

export async function setAssessmentStatus(userId: number, id: number, status: AssessmentStatus) {
  const cycle = await getActiveCycle(userId);
  return changePlanner(userId, (state, tx) => applyAssessmentStatus(tx, state, userId, cycle.id, id, status));
}

export function saveNavigation(userId: number, navigation: NavigationPrefs) {
  const valid = new Set<string>(defaultDesktopTabs);
  for (const paths of [navigation.mobile, navigation.desktop]) {
    if (paths.some(path => !valid.has(path)) || new Set(paths).size !== paths.length) {
      throw new Error("اختار تبويبات مختلفة من القائمة.");
    }
  }
  if (!navigation.desktop.includes("/settings")) throw new Error("الإعدادات لازم تفضل متاحة في القائمة الجانبية.");
  return changePlanner(userId, async state => { state.navigation = { ...navigation, libraryTabSeen: true, librarySectionsSeen: true, quranTabSeen: true, musicTabSeen: true, welcomeTabSeen: true, notebookTabSeen: true }; });
}

export async function setNafl(userId: number, day: string, name: typeof nawafil[number], done: boolean) {
  const cycle = await getActiveCycle(userId);
  return changePlanner(userId, async (state, tx) => {
    if (day !== plannerToday()) throw new Error("حدّث الصفحة عشان تسجل نوافل النهارده.");
    if (!done) {
      const paid = await creditedPrayers(tx, userId, day);
      if (paid.length === prayers.length) throw new Error("نقاط اليوم اتحسبت بعد إكمال القائمة.");
    }
    state.nawafilByDay ??= {};
    const entries = new Set(state.nawafilByDay[day] ?? []);
    if (done) entries.add(name);
    else entries.delete(name);
    state.nawafilByDay[day] = Array.from(entries);
    return settlePrayerPoints(tx, state, userId, cycle.id, day);
  });
}

async function creditedPrayers(tx: StudyTransaction, userId: number, day: string) {
  return tx.select({ reference: coinTransactions.referenceKey }).from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), inArray(coinTransactions.referenceKey, prayers.map(prayer => prayerReference(userId, day, prayer)))));
}

async function settlePrayerPoints(tx: StudyTransaction, state: PlannerState, userId: number, cycleId: number, day: string) {
  if (!nawafil.every(name => state.nawafilByDay?.[day]?.includes(name))) return { amount: 0 };
  const paid = new Set((await creditedPrayers(tx, userId, day)).map(row => row.reference));
  if (!prayers.every(prayer => state.prayersByDay?.[day]?.includes(prayer) || paid.has(prayerReference(userId, day, prayer)))) {
    return { amount: 0 };
  }
  const remaining = prayers.filter(prayer => !paid.has(prayerReference(userId, day, prayer)));
  if (!remaining.length) return { amount: 0 };
  const [rate] = await tx.select({ amount: coinRateSettings.amount }).from(coinRateSettings)
    .where(eq(coinRateSettings.rateKey, "prayer_complete")).limit(1);
  const amount = rate?.amount ?? coinRateCatalog.prayer_complete[1];
  if (!amount) return { amount: 0 };
  await tx.insert(coinTransactions).values(remaining.map(prayer => ({
    userId, cycleId, amount, type: "earn" as const,
    reason: "صلاة " + prayerNames[prayer], referenceKey: prayerReference(userId, day, prayer),
  })));
  return { amount: remaining.length * amount };
}

async function placeExamMistakeReview(tx: StudyTransaction, userId: number, state: PlannerState,
  exam: typeof exams.$inferSelect, lessonId: number, today: string) {
  if (exam.archivedAt || !exam.scheduledAt) return;
  const deadline = examOccurrences([exam], today, shiftPlannerDay(today, 7), state.slots)
    .find(item => item.scheduledAt > new Date());
  if (!deadline || state.studySessions?.some(item => item.lessonId === lessonId && item.kind === "review" &&
      !item.done && item.day >= today && cairoPlannerTime(item.day, item.end) <= deadline.scheduledAt)) return;
  const lesson = await ownedLesson(tx, userId, lessonId);
  const duration = 15;
  for (let day = today; day <= deadline.day; day = shiftPlannerDay(day, 1)) {
    const { free } = await studyAvailability(tx, userId, state, day);
    const gap = free.find(item => item.end - item.start >= duration &&
      +cairoPlannerTime(day, examClock(item.start)) + duration * 60_000 <= +deadline.scheduledAt);
    if (!gap) continue;
    (state.studySessions ??= []).push({ id: crypto.randomUUID(), day, start: examClock(gap.start), end: examClock(gap.start + duration),
      title: "مراجعة قبل الامتحان: " + lesson.title.slice(0, 170), kind: "review", lessonId });
    return;
  }
}

export async function saveStudyResource(userId: number, change: StudyResourceChange) {
  const cycle = ["homework", "check", "solveBookLesson"].includes(change.type) ? await getActiveCycle(userId) : undefined;
  return changePlanner(userId, async (state, tx) => {
    const resources = state.resources ??= structuredClone(emptyResources);
    if (change.type === "check") {
      const item = resources.mistakes.find(row => row.id === change.id);
      if (!item) throw new Error("السؤال مش موجود.");
      const day = plannerToday();
      if (item.lastChecked === day || (!change.examId && item.due > day)) return;
      if (change.examId) {
        const [exam] = await tx.select().from(exams).where(and(eq(exams.id, change.examId), eq(exams.userId, userId)));
        if (!exam) throw new Error("الامتحان مش موجود.");
        if (item.lessonId && !change.correct) {
          const [link] = await tx.select({ lessonId: examLessons.lessonId }).from(examLessons)
            .where(and(eq(examLessons.examId, exam.id), eq(examLessons.lessonId, item.lessonId)));
          if (link || exam.lessonId === item.lessonId) await placeExamMistakeReview(tx, userId, state, exam, item.lessonId, day);
        }
      }
      item.lastChecked = day;
      if (cycle) await awardPlannerCoins(tx, userId, cycle.id, "mistake_review", `mistake:${item.id}:${day}`, "مراجعة سؤال من كشكول الأخطاء");
      item.lastCorrect = change.correct;
      item.streak = change.correct ? item.streak + 1 : 0;
      item.due = shiftPlannerDay(day, [1, 3, 7, 14, 30][Math.min(item.streak, 4)]);
      return;
    }
    if (change.type === "solveBookLesson") {
      const book = resources.books.find(row => row.id === change.id);
      const lesson = await ownedLesson(tx, userId, change.lessonId);
      if (!book || book.subjectId !== lesson.subjectId) throw new Error("اختار درس من نفس مادة الكتاب.");
      const solved = book.solvedLessonIds ??= [];
      if (book.backlogMode === "manual") book.backlog = book.backlog.filter(id => id !== change.lessonId);
      if (solved.includes(change.lessonId)) return;
      if (cycle) await awardPlannerCoins(tx, userId, cycle.id, "book_lesson_solved", `book:${book.id}:${change.lessonId}`, "إكمال حل درس في كتاب: " + book.title);
      solved.push(change.lessonId);
      return;
    }
    const item = change.item;
    if (change.type === "homework") {
      const existing = resources.homework.find(row => row.id === change.item.id);
      if (existing && existing.lessonId !== change.item.lessonId) throw new Error("ضيف واجب جديد للدرس التاني.");
      const lesson = await ownedLesson(tx, userId, change.item.lessonId);
      if (change.item.kind !== "online") {
        const { bookId } = change.item;
        const book = resources.books.find(row => row.id === bookId);
        if (!book || book.subjectId !== lesson.subjectId) throw new Error("اختار كتاب من نفس مادة الدرس.");
      } else if (!safeStudyUrl(change.item.url)) {
        throw new Error("رابط الواجب غير صالح.");
      }
      if (change.item.kind === "online" && change.item.sourceId !== undefined) {
        const item = change.item;
        const [source] = await tx.select({ id: lessonSources.id }).from(lessonSources)
          .where(and(eq(lessonSources.userId, userId), eq(lessonSources.id, item.sourceId!)));
        if (!source) throw new Error("مصدر المدرس مش موجود.");
        if (item.rememberSite) {
          const url = safeStudyUrl(item.siteUrl ?? item.url);
          if (!url) throw new Error("اكتب رابط الموقع الأساسي.");
          const saved = state.savedHomeworkSites ?? [];
          state.savedHomeworkSites = [...saved.filter(site => site.sourceId !== source.id || site.name !== item.platform),
            { sourceId: source.id, name: item.platform, url }].slice(-100);
        }
      }
      if (resources.homework.length >= 500 && !resources.homework.some(row => row.id === item.id)) throw new Error("وصلت للحد الأقصى للواجبات.");
      resources.homework = [...resources.homework.filter(row => row.id !== item.id), change.item];
      const attendance = [...state.attendance].reverse().find(row => row.lessonId === change.item.lessonId);
      if (attendance && cycle) {
        const nextDay = Array.from({ length: 14 }, (_, index) => shiftPlannerDay(attendance.day, index + 1))
          .find(day => state.slots.some(slot => slot.subjectId === lesson.subjectId && slotOccurs(slot, day)));
        const nextSlot = nextDay && state.slots.filter(slot => slot.subjectId === lesson.subjectId && slotOccurs(slot, nextDay))
          .sort((a, b) => a.start.localeCompare(b.start))[0];
        await publishLessonHomework(tx, state, userId, cycle.id, change.item, lesson.title, attendance.day,
          nextDay && nextSlot ? cairoPlannerTime(nextDay, nextSlot.start) : null);
      }
      return;
    }
    if (change.item.lessonId && (await ownedLesson(tx, userId, change.item.lessonId)).subjectId !== change.item.subjectId) {
      throw new Error("اختار درس من نفس مادة السؤال.");
    }
    const [subject] = await tx.select({ id: subjects.id }).from(subjects)
      .where(and(eq(subjects.id, change.item.subjectId), eq(subjects.userId, userId)));
    if (!subject) throw new Error("المادة مش موجودة.");
    if (change.type === "book") {
      const book = change.item;
      const old = resources.books.find(row => row.id === book.id);
      if (old && old.subjectId !== book.subjectId && resources.homework.some(row => row.kind !== "online" && row.bookId === book.id)) {
        throw new Error("الكتاب مرتبط بواجبات. اختار كتاب جديد للمادة التانية.");
      }
      const branchThrough = Object.entries(book.branchThrough ?? {});
      const lessonIds = Array.from(new Set([...book.backlog, ...branchThrough.map(([, id]) => id), ...(book.through ? [book.through] : [])]));
      if (lessonIds.length) {
        const valid = await tx.select({ id: lessons.id, chapterId: lessons.chapterId }).from(lessons).innerJoin(chapters, eq(chapters.id, lessons.chapterId))
          .where(and(eq(chapters.subjectId, book.subjectId), inArray(lessons.id, lessonIds), isNull(lessons.deletedAt)));
        if (valid.length !== lessonIds.length) throw new Error("اختار دروس من نفس مادة الكتاب.");
        const chaptersByLesson = new Map(valid.map(row => [row.id, row.chapterId]));
        if (branchThrough.some(([chapter, id]) => Number(chapter) !== chaptersByLesson.get(id))) {
          throw new Error("اختار آخر درس محلول من نفس الفرع.");
        }
      }
      if (!old && resources.books.length >= 100) throw new Error("وصلت للحد الأقصى للكتب.");
      resources.books = [...resources.books.filter(row => row.id !== item.id), {
        ...book,
        backlogMode: book.backlogMode ?? (old?.subjectId === book.subjectId ? old.backlogMode : undefined),
        branchThrough: book.branchThrough ?? (old?.subjectId === book.subjectId ? old.branchThrough : undefined),
        solvedLessonIds: old?.subjectId === book.subjectId ? old.solvedLessonIds : undefined,
      }];
      return;
    }
    const previous = resources.mistakes.find(row => row.id === item.id);
    if (!previous && resources.mistakes.length >= 300) throw new Error("وصلت للحد الأقصى للأسئلة.");
    resources.mistakes = [...resources.mistakes.filter(row => row.id !== item.id),
      { ...change.item, due: previous?.due ?? plannerToday(), streak: previous?.streak ?? 0 }];
  });
}

async function publishLessonHomework(tx: StudyTransaction, state: PlannerState, userId: number, cycleId: number,
  item: NonNullable<PlannerState["resources"]>["homework"][number], lessonTitle: string, day: string, deadline: Date | null) {
  const resources = state.resources;
  if (!resources) return;
  const sourceTitle = item.kind === "online" ? item.platform : resources.books.find(row => row.id === item.bookId)?.title;
  if (!sourceTitle) return;
  const key = day + ":" + item.id;
  const published = resources.published ??= {};
  const title = ("واجب " + lessonTitle + " · " + sourceTitle).slice(0, 200);
  const description = item.kind === "online"
    ? [item.prompt, "رابط الواجب: " + item.url].filter(Boolean).join("\n")
    : "الصفحات: " + item.pages + (item.prompt ? "\n" + item.prompt : "");
  if (published[key]) {
    await tx.update(tasks).set({ title, description }).where(and(eq(tasks.id, published[key]), eq(tasks.userId, userId)));
    return;
  }
  const [result] = await tx.insert(tasks).values({ userId, cycleId, title, description, scheduledFor: day, deadline, category: "واجب" });
  published[key] = result.insertId;
}

function prayerEndForSchedule(day: string, prayer: Prayer, times: Record<Prayer, string>, state: PlannerState) {
  const start = plannerMinutes(times[prayer]);
  const normalEnd = prayerLoggingEnd(prayer, start, plannerMinutes(times.Dhuhr));
  return state.slots.some(slot => slot.subjectId && slotOccurs(slot, day) &&
    plannerMinutes(slot.start) < normalEnd && plannerMinutes(slot.end) > start) ? 1440 : normalEnd;
}
