import { TRPCError } from "@trpc/server";
import { coinRateKeys } from "../shared/coinRates.js";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { downloadDailyBackup, keepDailyBackup, listDailyBackups, restoreStudyBackup, signedStudyBackup } from "./studyBackup.js";
import * as db from "./db.js";
import * as personalAssistant from "./personalAssistant.js";
import { safeStudyUrl } from "../client/src/lib/videoSources.js";

function validateOfflineTimestamp(userId: number, ownerId: number, timestamp: number) {
  if (userId !== ownerId) throw new TRPCError({ code: "FORBIDDEN" });
  if (timestamp < Date.UTC(2020, 0, 1) || timestamp > Date.now() + 300_000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "راجع تاريخ وساعة الجهاز." });
  }
}

const id = z.number().int().positive();
const date = z.coerce.date();
const priority = z.enum(["urgent", "medium", "low"]);
const difficulty = z.enum(["easy", "medium", "hard"]);
const lessonSourceInput = z.object({
  subject: z.string().trim().min(1).max(80),
  platform: z.string().trim().min(1).max(180),
  teacherName: z.string().trim().min(1).max(180),
  delivery: z.enum(["online", "in_person", "hybrid"]),
  role: z.enum(["primary", "review", "support"]),
  url: z.string().url().max(768).optional(),
  location: z.string().trim().max(255).optional(),
  weeklyPlan: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const plannerTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const plannerSlot = z.object({
  id: z.string().uuid(), weekday: z.number().int().min(0).max(6),
  start: plannerTime, end: plannerTime, title: z.string().trim().min(1).max(200),
  subjectId: id.optional(), sourceId: id.optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 }); return { success: true } as const; }),
  }),
  workspaceSearch: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(100) }))
    .query(({ ctx, input }) => db.searchWorkspaceTitles(ctx.user.id, input.query)),
  trash: router({
    list: protectedProcedure.query(({ ctx }) => db.listStudyTrash(ctx.user.id)),
    restore: protectedProcedure.input(z.object({ kind: z.enum(["tasks", "chats", "lessons"]), id }))
      .mutation(({ ctx, input }) => db.restoreStudyTrash(ctx.user.id, input.kind, input.id)),
  }),
  backup: router({
    keepDaily: protectedProcedure.mutation(({ ctx }) => keepDailyBackup(ctx.user.id, ctx.user.role === "admin")),
    daily: protectedProcedure.query(({ ctx }) => listDailyBackups(ctx.user.id)),
    downloadDaily: protectedProcedure.input(z.object({ backupId: id })).mutation(({ ctx, input }) => downloadDailyBackup(ctx.user.id, input.backupId)),
    importCsv: protectedProcedure.input(z.object({
      kind: z.enum(["tasks", "exams"]),
      preview: z.boolean(),
      rows: z.array(z.object({
        title: z.string().trim().min(1).max(200),
        day: z.string().date().optional(),
        priority: z.enum(["urgent", "medium", "low"]),
      })).min(1).max(250),
    })).mutation(({ ctx, input }) => db.importStudyCsv(ctx.user.id, input.kind, input.rows, input.preview)),
    export: protectedProcedure.mutation(({ ctx }) => signedStudyBackup(ctx.user.id, ctx.user.role === "admin")),
    restore: protectedProcedure.input(z.object({ raw: z.string().min(1).max(2_500_000), preview: z.boolean() }))
      .mutation(({ ctx, input }) => restoreStudyBackup(ctx.user.id, input.raw, input.preview)),
  }),
  dashboard: router({ summary: protectedProcedure.query(({ ctx }) => db.dashboard(ctx.user.id)) }),
  studyPlan: router({
    reopen: protectedProcedure.input(z.object({ lessonId: id })).mutation(({ ctx, input }) => db.reopenLesson(ctx.user.id, input.lessonId)),
    syncCompletion: protectedProcedure.input(z.object({ ownerId: id, lessonId: id, completedAt: z.number().int().positive() }))
      .mutation(({ ctx, input }) => {
        validateOfflineTimestamp(ctx.user.id, input.ownerId, input.completedAt);
        return db.completeLesson(ctx.user.id, input.lessonId, new Date(input.completedAt));
      }),
    reviews: protectedProcedure.query(({ ctx }) => db.lessonReviewSchedule(ctx.user.id)),
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
    reopen: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => db.reopenTask(ctx.user.id, input.taskId)),
    syncCreate: protectedProcedure.input(z.object({ ownerId: id, key: z.string().uuid(), title: z.string().trim().min(1).max(200), day: z.string().date() }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.id !== input.ownerId) throw new TRPCError({ code: "FORBIDDEN" });
        return db.syncOfflineTask(ctx.user.id, input);
      }),
    createRecurring: protectedProcedure.input(z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().max(2000).optional(), category: z.string().trim().min(1).max(80).optional(),
      priority, startsOn: z.string().date(), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      weeks: z.number().int().min(1).max(52),
    })).mutation(({ ctx, input }) => db.createRecurringTasks(ctx.user.id, input)),
    syncCompletion: protectedProcedure.input(z.object({ ownerId: id, taskId: id, completedAt: z.number().int().positive(), expectedUpdatedAt: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (input.completedAt < Date.UTC(2020, 0, 1) || input.completedAt > Date.now() + 300_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "راجع تاريخ وساعة الجهاز." });
        }
        return db.completeTask(ctx.user.id, input.taskId, new Date(input.completedAt), input.expectedUpdatedAt);
      }),
    list: protectedProcedure.query(({ ctx }) => db.listTasks(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), scheduledFor: z.string().date().optional(), deadline: date.optional(), priority, category: z.string().trim().min(1).max(80).optional() })).mutation(({ ctx, input }) => db.createTask(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ taskId: id, title: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), scheduledFor: z.string().date().optional(), deadline: date.optional(), priority, category: z.string().trim().min(1).max(80).optional() })).mutation(({ ctx, input }) => db.updateTask(ctx.user.id, input.taskId, input)),
    delete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => db.deleteTask(ctx.user.id, input.taskId)),
    complete: protectedProcedure.input(z.object({ taskId: id })).mutation(({ ctx, input }) => db.completeTask(ctx.user.id, input.taskId)),
  }),
  planner: router({
    saveStudy: protectedProcedure.input(z.object({
      id: z.string().uuid(), day: z.string().date(), title: z.string().trim().min(1).max(200),
      start: plannerTime, end: plannerTime, kind: z.enum(["homework", "review", "backlog", "study"]), lessonId: id.optional(),
    })).mutation(({ ctx, input }) => db.savePlannedStudy(ctx.user.id, input)),
    finishStudy: protectedProcedure.input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => db.finishPlannedStudy(ctx.user.id, input.id)),
    removeStudy: protectedProcedure.input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => db.removePlannedStudy(ctx.user.id, input.id)),
    chooseBacklogSubject: protectedProcedure.input(z.object({ subjectId: id }))
      .mutation(({ ctx, input }) => db.chooseBacklogSubject(ctx.user.id, input.subjectId)),
    markBacklog: protectedProcedure.input(z.object({ lessonIds: z.array(id).min(1).max(100), marked: z.boolean() }))
      .mutation(({ ctx, input }) => db.markBacklog(ctx.user.id, input.lessonIds, input.marked)),
    teacherNext: protectedProcedure.input(z.object({ subjectId: id, lessonId: id.optional() }))
      .mutation(({ ctx, input }) => db.setTeacherNext(ctx.user.id, input.subjectId, input.lessonId)),
    list: protectedProcedure.query(({ ctx }) => db.getPlanner(ctx.user.id)),
    hours: protectedProcedure.input(z.object({ wake: plannerTime, sleep: plannerTime }))
      .mutation(({ ctx, input }) => db.savePlannerHours(ctx.user.id, input.wake, input.sleep)),
    saveSlot: protectedProcedure.input(z.object({ slot: plannerSlot, allowOverlap: z.boolean() }))
      .mutation(({ ctx, input }) => db.savePlannerSlot(ctx.user.id, input.slot, input.allowOverlap)),
    removeSlot: protectedProcedure.input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => db.removePlannerSlot(ctx.user.id, input.id)),
    attend: protectedProcedure.input(z.object({ slotId: z.string().uuid(), day: z.string().date(), lessonIds: z.array(id).min(1).max(100) }))
      .mutation(({ ctx, input }) => db.attendPlannerClass(ctx.user.id, input)),
    schedule: protectedProcedure.input(z.object({ id: z.string().max(100), day: z.string().date(), start: plannerTime, minutes: z.number().int().min(5).max(1440) }))
      .mutation(({ ctx, input }) => db.schedulePlannerMilestone(ctx.user.id, input)),
  }),
  lessonSources: router({
    list: protectedProcedure.query(({ ctx }) => db.listLessonSources(ctx.user.id)),
    seedDefaults: protectedProcedure.mutation(({ ctx }) => db.seedSeifLessonSources(ctx.user.id)),
    create: protectedProcedure.input(lessonSourceInput).mutation(({ ctx, input }) => db.createLessonSource(ctx.user.id, input)),
    update: protectedProcedure.input(lessonSourceInput.extend({ sourceId: id, active: z.boolean() })).mutation(({ ctx, input }) => db.updateLessonSource(ctx.user.id, input.sourceId, input)),
    delete: protectedProcedure.input(z.object({ sourceId: id })).mutation(({ ctx, input }) => db.deleteLessonSource(ctx.user.id, input.sourceId)),
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
    syncOffline: protectedProcedure.input(z.object({
      ownerId: id, key: z.string().uuid(),
      minutes: z.union([z.literal(15), z.literal(25), z.literal(45), z.literal(60)]),
      startedAt: z.number().int().positive(), completedAt: z.number().int().positive(),
    })).mutation(({ ctx, input }) => {
      if (ctx.user.id !== input.ownerId) throw new TRPCError({ code: "FORBIDDEN", message: "افتح الحساب اللي سجّل الجلسة." });
      return db.syncOfflineFocus(ctx.user.id, input);
    }),
    assignments: protectedProcedure.query(({ ctx }) => db.listFocusAssignments(ctx.user.id)),
    assignSubject: protectedProcedure.input(z.object({ eventIds: z.array(id).min(1).max(400), subjectId: id.nullable() }))
      .mutation(({ ctx, input }) => db.assignFocusSubject(ctx.user.id, input.eventIds, input.subjectId)),
    list: protectedProcedure.query(({ ctx }) => db.listPomodoros(ctx.user.id)),
    start: protectedProcedure.input(z.object({ plannedMinutes: z.union([z.literal(15), z.literal(25), z.literal(45), z.literal(60)]), subjectId: id.optional() })).mutation(({ ctx, input }) => db.startPomodoro(ctx.user.id, input)),
    setPaused: protectedProcedure.input(z.object({ sessionId: id, paused: z.boolean() })).mutation(({ ctx, input }) => db.pausePomodoro(ctx.user.id, input.sessionId, input.paused)),
    complete: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.completePomodoro(ctx.user.id, input.sessionId)),
  }),
  studySearch: router({ query: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(120) })).query(({ ctx, input }) => db.searchStudyWorkspace(ctx.user.id, input.query)) }),
  flashcards: router({
    list: protectedProcedure.query(({ ctx }) => db.listFlashcardDecks(ctx.user.id)),
    createDeck: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(180), description: z.string().max(4000).optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() })).mutation(({ ctx, input }) => db.createFlashcardDeck(ctx.user.id, input)),
    create: protectedProcedure.input(z.object({ deckId: id, prompt: z.string().trim().min(1).max(10000), answer: z.string().trim().min(1).max(10000) })).mutation(({ ctx, input }) => db.createFlashcard(ctx.user.id, input)),
    review: protectedProcedure.input(z.object({ cardId: id, result: z.enum(["again", "good", "mastered"]) })).mutation(({ ctx, input }) => db.reviewFlashcard(ctx.user.id, input.cardId, input.result)),
    delete: protectedProcedure.input(z.object({ cardId: id })).mutation(({ ctx, input }) => db.deleteFlashcard(ctx.user.id, input.cardId)),
  }),
  video: router({
    current: protectedProcedure.query(({ ctx }) => db.currentVideoSession(ctx.user.id)),
    history: protectedProcedure.query(({ ctx }) => db.listVideoSessions(ctx.user.id)),
    createNote: protectedProcedure.input(z.object({ sessionId: id, title: z.string().trim().min(1).max(220), content: z.string().trim().min(1).max(30000), timestampSeconds: z.number().int().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.createVideoNote(ctx.user.id, input)),
    updateNote: protectedProcedure.input(z.object({ noteId: id, title: z.string().trim().min(1).max(220), content: z.string().trim().min(1).max(30000), timestampSeconds: z.number().int().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.updateVideoNote(ctx.user.id, input.noteId, input)),
    deleteNote: protectedProcedure.input(z.object({ noteId: id })).mutation(({ ctx, input }) => db.deleteVideoNote(ctx.user.id, input.noteId)),
    start: protectedProcedure.input(z.object({ videoUrl: z.string().trim().min(1).max(2000), lessonTitle: z.string().trim().max(220).optional(), subject: z.enum(["arabic", "history", "english", "programming_ai", "german", "other"]).default("other"), requestedMode: z.enum(["auto", "embedded", "external"]).default("auto") })).mutation(({ ctx, input }) => { const videoUrl = safeStudyUrl(input.videoUrl); if (!videoUrl) throw new Error("استخدم رابطًا صالحًا يبدأ بـ http:// أو https:// فقط."); return db.startVideoSession(ctx.user.id, { ...input, videoUrl }); }),
    end: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.endVideoSession(ctx.user.id, input.sessionId)),
    heartbeat: protectedProcedure.input(z.object({ sessionId: id, active: z.boolean(), playbackPosition: z.number().min(0).max(172800).optional() })).mutation(({ ctx, input }) => db.trackVideoPlayback(ctx.user.id, input.sessionId, input)),
    resume: protectedProcedure.input(z.object({ sessionId: id })).mutation(({ ctx, input }) => db.resumeVideoSession(ctx.user.id, input.sessionId)),
    setExternalTimer: protectedProcedure.input(z.object({ sessionId: id, running: z.boolean() })).mutation(({ ctx, input }) => db.setExternalVideoTimer(ctx.user.id, input.sessionId, input.running)),
    setProgress: protectedProcedure.input(z.object({ sessionId: id, progress: z.enum(["started", "middle", "finished", "reviewed"]) })).mutation(({ ctx, input }) => db.setVideoManualProgress(ctx.user.id, input.sessionId, input.progress)),
  }),
  exams: router({
    syncAttempt: protectedProcedure.input(z.object({
      ownerId: id, key: z.string().uuid(), examId: id, totalQuestions: z.number().int().min(1).max(500),
      correctAnswers: z.number().int().min(0).max(500), difficulty, missedTopics: z.array(z.string().trim().min(1).max(120)).max(40),
      completedAt: z.number().int().positive(),
    }).refine(input => input.correctAnswers <= input.totalQuestions)).mutation(({ ctx, input }) => {
      validateOfflineTimestamp(ctx.user.id, input.ownerId, input.completedAt);
      return db.syncOfflineExam(ctx.user.id, { ...input, completedAt: new Date(input.completedAt) });
    }),
    list: protectedProcedure.query(({ ctx }) => db.listExams(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), subjectId: id.optional(), chapterId: id.optional(), lessonId: id.optional(), lessonIds: z.array(id).max(250).optional(), scheduledAt: date.optional() })).mutation(({ ctx, input }) => db.createExam(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ examId: id, title: z.string().trim().min(1).max(200), scheduledAt: date.nullable().optional(), lessonIds: z.array(id).max(250).optional() })).mutation(({ ctx, input }) => db.updateExam(ctx.user.id, input)),
    setArchived: protectedProcedure.input(z.object({ examId: id, archived: z.boolean() })).mutation(({ ctx, input }) => db.setExamArchived(ctx.user.id, input.examId, input.archived)),
    completeAttempt: protectedProcedure.input(z.object({ examId: id, totalQuestions: z.number().int().min(1).max(500), correctAnswers: z.number().int().min(0).max(500), difficulty, missedTopics: z.array(z.string().trim().min(1).max(120)).max(40) })).mutation(({ ctx, input }) => db.completeExamAttempt(ctx.user.id, input)),
  }),
  ai: router({
    chat: protectedProcedure.input(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(5000) })).min(1).max(12) })).mutation(({ ctx, input }) => db.chatWithAssistant(ctx.user.id, input.messages)),
  }),
  personalAssistant: router({
    plan: protectedProcedure.input(z.object({ request: z.string().trim().min(1).max(1200), page: z.string().max(100).optional(), shareWithOpenRouter: z.boolean().default(false), chatId: id.optional(), includeChatHistory: z.boolean().default(false), multiple: z.boolean().default(false) })).mutation(({ ctx, input }) => personalAssistant.planPersonalAssistantAction(ctx.user.id, input.request, input.page, input.shareWithOpenRouter, input.chatId, input.includeChatHistory, input.multiple)),
    chats: protectedProcedure.query(({ ctx }) => db.listAssistantChats(ctx.user.id)),
    createChat: protectedProcedure.mutation(({ ctx }) => db.createAssistantChat(ctx.user.id)),
    renameChat: protectedProcedure.input(z.object({ chatId: id.optional(), title: z.string().trim().min(1).max(100) }))
      .mutation(({ ctx, input }) => db.renameAssistantChat(ctx.user.id, input.title, input.chatId)),
    deleteChat: protectedProcedure.input(z.object({ chatId: id.optional() }))
      .mutation(({ ctx, input }) => db.deleteAssistantChat(ctx.user.id, input.chatId)),
    chatMessages: protectedProcedure.input(z.object({ chatId: id.optional() })).query(({ ctx, input }) => db.listAssistantMessages(ctx.user.id, 500, input.chatId)),
    memory: protectedProcedure.query(({ ctx }) => db.listAssistantMessages(ctx.user.id)),
    dailySummary: protectedProcedure.mutation(({ ctx }) => db.getDailyStudySummary(ctx.user.id)),
    execute: protectedProcedure.input(z.object({ plan: z.object({ reply: z.string().max(1200), actionType: z.enum(personalAssistant.personalAssistantActionTypes), title: z.string().max(200), targetTitle: z.string().max(200), parentTitle: z.string().max(200).optional(), value: z.number().int().min(0).max(1_000_000).optional(), priority: z.enum(["urgent", "medium", "low"]), scheduledFor: z.string().max(10), frequency: z.enum(["daily", "weekly"]), target: z.number().int().min(1).max(7), route: z.enum(personalAssistant.personalAssistantRoutes), requiresConfirmation: z.boolean() }), confirmed: z.literal(true), chatId: id.optional() })).mutation(async ({ ctx, input }) => { if (input.chatId !== undefined) await db.ownedAssistantChat(ctx.user.id, input.chatId); const result = await personalAssistant.executePersonalAssistantAction(ctx.user.id, input.plan, input.confirmed, ctx.user.role === "admin"); await db.saveAssistantMessage(ctx.user.id, "assistant", result.message, input.chatId); return result; }),
  }),
  notebooks: router({
    list: protectedProcedure.query(({ ctx }) => db.listNotebooks(ctx.user.id)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) => db.createNotebook(ctx.user.id, input.title)),
    notes: protectedProcedure.input(z.object({ notebookId: id })).query(({ ctx, input }) => db.listNotes(ctx.user.id, input.notebookId)),
    createNote: protectedProcedure.input(z.object({ notebookId: id, title: z.string().trim().min(1).max(220), content: z.string().max(30000) })).mutation(({ ctx, input }) => db.createNote(ctx.user.id, input)),
    sources: protectedProcedure.input(z.object({ notebookId: id })).query(({ ctx, input }) => db.listNotebookSources(ctx.user.id, input.notebookId)),
    uploadSource: protectedProcedure.input(z.object({ notebookId: id, fileName: z.string().trim().min(1).max(320), mimeType: z.enum(["text/plain", "text/markdown", "application/pdf"]), contentBase64: z.string().min(1).max(7_000_000) })).mutation(({ ctx, input }) => db.uploadNotebookSource(ctx.user.id, input)),
    createQuiz: protectedProcedure.input(z.object({ notebookId: id })).mutation(({ ctx, input }) => db.createNotebookQuiz(ctx.user.id, input.notebookId)),
    markQuizReviewed: protectedProcedure.input(z.object({ examId: id })).mutation(({ ctx, input }) => db.markNotebookQuizReviewed(ctx.user.id, input.examId)),
    ai: protectedProcedure.input(z.object({ notebookId: id, mode: z.enum(["question", "summary", "quiz", "explain"]), prompt: z.string().trim().max(2000).optional() })).mutation(({ ctx, input }) => db.notebookAI(ctx.user.id, input)),
  }),
  calendar: router({
    list: protectedProcedure.input(z.object({ from: date, to: date })).query(({ ctx, input }) => db.listCalendar(ctx.user.id, input.from, input.to)),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(200), startsAt: date, endsAt: date.optional(), eventType: z.enum(["important_date", "custom"]) })).mutation(({ ctx, input }) => db.createCalendarEvent(ctx.user.id, input)),
  }),
  economy: router({
    rates: protectedProcedure.query(() => db.listCoinRates()),
    setRate: adminProcedure.input(z.object({ key: z.enum(coinRateKeys), amount: z.number().int().min(0).max(1_000_000) }))
      .mutation(({ input }) => db.setCoinRate(input.key, input.amount)),
    setRewardPrice: adminProcedure.input(z.object({ rewardId: id, cost: z.number().int().positive().max(1_000_000) }))
      .mutation(({ input }) => db.setRewardPrice(input.rewardId, input.cost)),
  }),
  rewards: router({
    list: protectedProcedure.query(({ ctx }) => db.listRewards(ctx.user.id, ctx.user.role === "admin")),
    purchase: protectedProcedure.input(z.object({ rewardId: id, referenceKey: z.string().uuid() })).mutation(({ ctx, input }) => db.purchaseReward(ctx.user.id, input.rewardId, input.referenceKey)),
    create: adminProcedure.input(z.object({
      title: z.string().trim().min(1).max(220),
      cost: z.number().int().positive().max(1_000_000),
      rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary", "mythic"]).default("common"),
    })).mutation(({ ctx, input }) => db.createReward(ctx.user.id, input)),
    setActive: adminProcedure.input(z.object({ rewardId: id, active: z.boolean() }))
      .mutation(({ input }) => db.setRewardActive(input.rewardId, input.active)),
  }),
  achievements: router({ list: protectedProcedure.query(({ ctx }) => db.listAchievements(ctx.user.id)) }),
  coins: router({ ledger: protectedProcedure.query(({ ctx }) => db.coinLedger(ctx.user.id)) }),
  analytics: router({ overview: protectedProcedure.query(({ ctx }) => db.analytics(ctx.user.id)), subjects: protectedProcedure.query(({ ctx }) => db.subjectAnalytics(ctx.user.id)) }),
});

export type AppRouter = typeof appRouter;
