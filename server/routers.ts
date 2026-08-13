import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

const id = z.number().int().positive();
const date = z.coerce.date();
const priority = z.enum(["urgent", "medium", "low"]);
const difficulty = z.enum(["easy", "medium", "hard"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true } as const; }),
  }),
  dashboard: router({ summary: protectedProcedure.query(({ ctx }) => db.dashboard(ctx.user.id)) }),
  studyPlan: router({
    list: protectedProcedure.query(({ ctx }) => db.listStudyPlan(ctx.user.id)),
    createSubject: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(160), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() })).mutation(({ ctx, input }) => db.createSubject(ctx.user.id, input)),
    updateSubject: protectedProcedure.input(z.object({ subjectId: id, title: z.string().trim().min(1).max(160), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() })).mutation(({ ctx, input }) => db.updateSubject(ctx.user.id, input.subjectId, input)),
    deleteSubject: protectedProcedure.input(z.object({ subjectId: id })).mutation(({ ctx, input }) => db.deleteSubject(ctx.user.id, input.subjectId)),
    createChapter: protectedProcedure.input(z.object({ subjectId: id, title: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) => db.createChapter(ctx.user.id, input)),
    updateChapter: protectedProcedure.input(z.object({ chapterId: id, title: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) => db.updateChapter(ctx.user.id, input.chapterId, input.title)),
    deleteChapter: protectedProcedure.input(z.object({ chapterId: id })).mutation(({ ctx, input }) => db.deleteChapter(ctx.user.id, input.chapterId)),
    createLesson: protectedProcedure.input(z.object({ chapterId: id, title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), estimatedMinutes: z.number().int().min(5).max(600), notes: z.string().max(8000).optional() })).mutation(({ ctx, input }) => db.createLesson(ctx.user.id, input)),
    updateLesson: protectedProcedure.input(z.object({ lessonId: id, title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), estimatedMinutes: z.number().int().min(5).max(600), notes: z.string().max(8000).optional() })).mutation(({ ctx, input }) => db.updateLesson(ctx.user.id, input.lessonId, input)),
    deleteLesson: protectedProcedure.input(z.object({ lessonId: id })).mutation(({ ctx, input }) => db.deleteLesson(ctx.user.id, input.lessonId)),
    updateProgress: protectedProcedure.input(z.object({ lessonId: id, progress: z.number().int().min(0).max(99) })).mutation(({ ctx, input }) => db.updateLessonProgress(ctx.user.id, input.lessonId, input.progress)),
    complete: protectedProcedure.input(z.object({ lessonId: id })).mutation(({ ctx, input }) => db.completeLesson(ctx.user.id, input.lessonId)),
    review: protectedProcedure.input(z.object({ lessonId: id })).mutation(({ ctx, input }) => db.reviewLesson(ctx.user.id, input.lessonId)),
  }),
  tasks: router({
    list: protectedProcedure.query(({ ctx }) => db.listTasks(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), scheduledFor: z.string().date().optional(), deadline: date.optional(), priority, category: z.string().trim().min(1).max(80).optional() })).mutation(({ ctx, input }) => db.createTask(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ taskId: id, title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), scheduledFor: z.string().date().optional(), deadline: date.optional(), priority, category: z.string().trim().min(1).max(80).optional() })).mutation(({ ctx, input }) => db.updateTask(ctx.user.id, input.taskId, input)),
    delete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => db.deleteTask(ctx.user.id, input.taskId)),
    complete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => db.completeTask(ctx.user.id, input.taskId)),
  }),
  habits: router({
    list: protectedProcedure.query(({ ctx }) => db.listHabits(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), frequency: z.enum(["daily", "weekly"]), target: z.number().int().min(1).max(7) })).mutation(({ ctx, input }) => db.createHabit(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ habitId: id, name: z.string().trim().min(1).max(160), frequency: z.enum(["daily", "weekly"]), target: z.number().int().min(1).max(7) })).mutation(({ ctx, input }) => db.updateHabit(ctx.user.id, input.habitId, input)),
    delete: protectedProcedure.input(z.object({ habitId: id })).mutation(({ ctx, input }) => db.deleteHabit(ctx.user.id, input.habitId)),
    complete: protectedProcedure.input(z.object({ habitId: id, completedOn: z.string().date().optional() })).mutation(({ ctx, input }) => db.completeHabit(ctx.user.id, input.habitId, input.completedOn)),
  }),
  goals: router({
    list: protectedProcedure.query(({ ctx }) => db.listGoals(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), deadline: date.optional(), milestones: z.array(z.object({ title: z.string().trim().min(1).max(180), targetPercent: z.number().int().min(1).max(100) })).max(8).optional() })).mutation(({ ctx, input }) => db.createGoal(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ goalId: id, title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), deadline: date.optional() })).mutation(({ ctx, input }) => db.updateGoal(ctx.user.id, input.goalId, input)),
    delete: protectedProcedure.input(z.object({ goalId: id })).mutation(({ ctx, input }) => db.deleteGoal(ctx.user.id, input.goalId)),
    updateProgress: protectedProcedure.input(z.object({ goalId: id, progress: z.number().int().min(0).max(100) })).mutation(({ ctx, input }) => db.updateGoalProgress(ctx.user.id, input.goalId, input.progress)),
  }),
  pomodoro: router({
    list: protectedProcedure.query(({ ctx }) => db.listPomodoros(ctx.user.id)),
    start: protectedProcedure.input(z.object({ plannedMinutes: z.union([z.literal(15), z.literal(25), z.literal(45), z.literal(60)]), subjectId: id.optional() })).mutation(({ ctx, input }) => db.startPomodoro(ctx.user.id, input)),
    setPaused: protectedProcedure.input(z.object({ sessionId: id, paused: z.boolean() })).mutation(({ ctx, input }) => db.pausePomodoro(ctx.user.id, input.sessionId, input.paused)),
    complete: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.completePomodoro(ctx.user.id, input.sessionId)),
  }),
  video: router({
    current: protectedProcedure.query(({ ctx }) => db.currentVideoSession(ctx.user.id)),
    history: protectedProcedure.query(({ ctx }) => db.listVideoSessions(ctx.user.id)),
    createNote: protectedProcedure.input(z.object({ sessionId: id, title: z.string().trim().min(1).max(220), content: z.string().trim().min(1).max(30000), timestampSeconds: z.number().int().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.createVideoNote(ctx.user.id, input)),
    updateNote: protectedProcedure.input(z.object({ noteId: id, title: z.string().trim().min(1).max(220), content: z.string().trim().min(1).max(30000), timestampSeconds: z.number().int().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.updateVideoNote(ctx.user.id, input.noteId, input)),
    deleteNote: protectedProcedure.input(z.object({ noteId: id })).mutation(({ ctx, input }) => db.deleteVideoNote(ctx.user.id, input.noteId)),
    start: protectedProcedure.input(z.object({ videoUrl: z.string().url().max(2000) })).mutation(({ ctx, input }) => db.startVideoSession(ctx.user.id, input.videoUrl)),
    end: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.endVideoSession(ctx.user.id, input.sessionId)),
    heartbeat: protectedProcedure.input(z.object({ sessionId: id, active: z.boolean(), playbackPosition: z.number().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.trackVideoPlayback(ctx.user.id, input.sessionId, input)),
    resume: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.resumeVideoSession(ctx.user.id, input.sessionId)),
  }),
  exams: router({
    list: protectedProcedure.query(({ ctx }) => db.listExams(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), subjectId: id.optional(), chapterId: id.optional(), lessonId: id.optional(), scheduledAt: date.optional() })).mutation(({ ctx, input }) => db.createExam(ctx.user.id, input)),
    completeAttempt: protectedProcedure.input(z.object({ examId: id, totalQuestions: z.number().int().min(1).max(500), correctAnswers: z.number().int().min(0).max(500), difficulty, missedTopics: z.array(z.string().trim().min(1).max(120)).max(40) })).mutation(({ ctx, input }) => db.completeExamAttempt(ctx.user.id, input)),
  }),
  ai: router({
    chat: protectedProcedure.input(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(5000) })).min(1).max(12) })).mutation(({ ctx, input }) => db.chatWithAssistant(ctx.user.id, input.messages)),
  }),
  notebooks: router({
    list: protectedProcedure.query(({ ctx }) => db.listNotebooks(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) => db.createNotebook(ctx.user.id, input.title)),
    notes: protectedProcedure.input(z.object({ notebookId: id })).query(({ ctx, input }) => db.listNotes(ctx.user.id, input.notebookId)),
    createNote: protectedProcedure.input(z.object({ notebookId: id, title: z.string().trim().min(1).max(220), content: z.string().max(30000) })).mutation(({ ctx, input }) => db.createNote(ctx.user.id, input)),
    ai: protectedProcedure.input(z.object({ notebookId: id, mode: z.enum(["question", "summary", "quiz", "explain"]), prompt: z.string().trim().max(2000).optional() })).mutation(({ ctx, input }) => db.notebookAI(ctx.user.id, input)),
  }),
  calendar: router({
    list: protectedProcedure.input(z.object({ from: date, to: date })).query(({ ctx, input }) => db.listCalendar(ctx.user.id, input.from, input.to)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), startsAt: date, endsAt: date.optional(), eventType: z.enum(["important_date", "custom"]) })).mutation(({ ctx, input }) => db.createCalendarEvent(ctx.user.id, input)),
  }),
  rewards: router({ list: protectedProcedure.query(({ ctx }) => db.listRewards(ctx.user.id)), purchase: protectedProcedure.input(z.object({ rewardId: id, referenceKey: z.string().uuid() })).mutation(({ ctx, input }) => db.purchaseReward(ctx.user.id, input.rewardId, input.referenceKey)) }),
  achievements: router({ list: protectedProcedure.query(({ ctx }) => db.listAchievements(ctx.user.id)) }),
  coins: router({ ledger: protectedProcedure.query(({ ctx }) => db.coinLedger(ctx.user.id)) }),
  analytics: router({ overview: protectedProcedure.query(({ ctx }) => db.analytics(ctx.user.id)) }),
});

export type AppRouter = typeof appRouter;
