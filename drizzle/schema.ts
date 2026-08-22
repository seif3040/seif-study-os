import { boolean, date, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const studyCycles = mysqlTable("studyCycles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleKey: varchar("cycleKey", { length: 96 }).notNull(),
  startAt: timestamp("startAt").notNull(),
  endAt: timestamp("endAt").notNull(),
  status: mysqlEnum("status", ["active", "completed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("studyCycles_user_cycleKey_unique").on(table.userId, table.cycleKey), index("studyCycles_user_status_idx").on(table.userId, table.status)]);

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  color: varchar("color", { length: 16 }).default("#10B981").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("subjects_user_cycle_idx").on(table.userId, table.cycleId)]);

export const chapters = mysqlTable("chapters", {
  id: int("id").autoincrement().primaryKey(),
  subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("chapters_subject_idx").on(table.subjectId)]);

export const lessons = mysqlTable("lessons", {
  id: int("id").autoincrement().primaryKey(),
  chapterId: int("chapterId").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  estimatedMinutes: int("estimatedMinutes").default(30).notNull(),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("lessons_chapter_idx").on(table.chapterId)]);

export const lessonProgress = mysqlTable("lessonProgress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: int("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["not_started", "in_progress", "completed"]).default("not_started").notNull(),
  progress: int("progress").default(0).notNull(),
  completedAt: timestamp("completedAt"),
  lastReviewedAt: timestamp("lastReviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("lessonProgress_user_lesson_unique").on(table.userId, table.lessonId), index("lessonProgress_user_status_idx").on(table.userId, table.status)]);

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  scheduledFor: date("scheduledFor", { mode: "string" }),
  deadline: timestamp("deadline"),
  priority: mysqlEnum("priority", ["urgent", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "completed"]).default("open").notNull(),
  category: varchar("category", { length: 80 }).default("دراسة").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("tasks_user_cycle_date_idx").on(table.userId, table.cycleId, table.scheduledFor)]);

export const assistantMessages = mysqlTable("assistantMessages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("assistantMessages_user_created_idx").on(table.userId, table.createdAt)]);

export const dailyStudySummaries = mysqlTable("dailyStudySummaries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  summaryDate: date("summaryDate", { mode: "string" }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("dailyStudySummaries_user_date_unique").on(table.userId, table.summaryDate), index("dailyStudySummaries_cycle_date_idx").on(table.cycleId, table.summaryDate)]);

export const habits = mysqlTable("habits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly"]).default("daily").notNull(),
  target: int("target").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("habits_user_cycle_idx").on(table.userId, table.cycleId)]);

export const habitCompletions = mysqlTable("habitCompletions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  habitId: int("habitId").notNull().references(() => habits.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  completedOn: date("completedOn", { mode: "string" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("habitCompletions_habit_date_unique").on(table.habitId, table.completedOn), index("habitCompletions_user_cycle_idx").on(table.userId, table.cycleId)]);

export const goals = mysqlTable("goals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  deadline: timestamp("deadline"),
  progress: int("progress").default(0).notNull(),
  status: mysqlEnum("status", ["active", "completed"]).default("active").notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("goals_user_cycle_idx").on(table.userId, table.cycleId)]);

export const goalMilestones = mysqlTable("goalMilestones", {
  id: int("id").autoincrement().primaryKey(),
  goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  targetPercent: int("targetPercent").notNull(),
  completedAt: timestamp("completedAt"),
}, table => [index("goalMilestones_goal_idx").on(table.goalId)]);

export const pomodoroSessions = mysqlTable("pomodoroSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").references(() => subjects.id, { onDelete: "set null" }),
  plannedMinutes: int("plannedMinutes").notNull(),
  completedMinutes: int("completedMinutes").default(0).notNull(),
  state: mysqlEnum("state", ["running", "paused", "completed", "cancelled"]).default("running").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  pausedAt: timestamp("pausedAt"),
  pausedSeconds: int("pausedSeconds").default(0).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("pomodoroSessions_user_cycle_idx").on(table.userId, table.cycleId)]);

export const studyVideoSessions = mysqlTable("studyVideoSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  videoUrl: text("videoUrl").notNull(),
  activeSeconds: int("activeSeconds").default(0).notNull(),
  completedBlocks: int("completedBlocks").default(0).notNull(),
  phase: mysqlEnum("phase", ["watching", "break", "completed"]).default("watching").notNull(),
  breakEndsAt: timestamp("breakEndsAt"),
  lastPlaybackPosition: int("lastPlaybackPosition"),
  lastPlaybackAt: timestamp("lastPlaybackAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("studyVideoSessions_user_cycle_idx").on(table.userId, table.cycleId)]);

export const videoNotes = mysqlTable("videoNotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: int("sessionId").notNull().references(() => studyVideoSessions.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 220 }).notNull(),
  content: text("content").notNull(),
  timestampSeconds: int("timestampSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("videoNotes_user_session_idx").on(table.userId, table.sessionId), index("videoNotes_session_timestamp_idx").on(table.sessionId, table.timestampSeconds)]);

export const exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").references(() => subjects.id, { onDelete: "set null" }),
  chapterId: int("chapterId").references(() => chapters.id, { onDelete: "set null" }),
  lessonId: int("lessonId").references(() => lessons.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  origin: mysqlEnum("origin", ["manual", "notebook_ai"]).default("manual").notNull(),
  notebookId: int("notebookId"),
  quizPayload: json("quizPayload").$type<{ sourceNames: string[]; questions: { question: string; answer: string; choices?: string[] }[] }>(),
  quizReviewedAt: timestamp("quizReviewedAt"),
  scheduledAt: timestamp("scheduledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("exams_user_cycle_idx").on(table.userId, table.cycleId)]);
export const examLessons = mysqlTable("examLessons", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull().references(() => exams.id, { onDelete: "cascade" }),
  lessonId: int("lessonId").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("examLessons_exam_lesson_unique").on(table.examId, table.lessonId), index("examLessons_lesson_idx").on(table.lessonId)]);


export const examAttempts = mysqlTable("examAttempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  examId: int("examId").notNull().references(() => exams.id, { onDelete: "cascade" }),
  totalQuestions: int("totalQuestions").notNull(),
  correctAnswers: int("correctAnswers").notNull(),
  incorrectAnswers: int("incorrectAnswers").notNull(),
  score: int("score").notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("medium").notNull(),
  missedTopics: json("missedTopics").$type<string[]>(),
  comprehensionScore: int("comprehensionScore").notNull(),
  completionRewarded: boolean("completionRewarded").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("examAttempts_user_cycle_idx").on(table.userId, table.cycleId), uniqueIndex("examAttempts_exam_attempt_unique").on(table.examId, table.id)]);

export const notebooks = mysqlTable("notebooks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("notebooks_user_cycle_idx").on(table.userId, table.cycleId)]);

export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  notebookId: int("notebookId").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 220 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("notes_notebook_idx").on(table.notebookId)]);

export const notebookSources = mysqlTable("notebookSources", {
  id: int("id").autoincrement().primaryKey(),
  notebookId: int("notebookId").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 320 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  extractedText: text("extractedText"),
  characterCount: int("characterCount").default(0).notNull(),
  isTruncated: boolean("isTruncated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notebookSources_notebook_idx").on(table.notebookId)]);

export const flashcardDecks = mysqlTable("flashcardDecks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).default("#8B5CF6").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("flashcardDecks_user_cycle_idx").on(table.userId, table.cycleId)]);

export const flashcards = mysqlTable("flashcards", {
  id: int("id").autoincrement().primaryKey(),
  deckId: int("deckId").notNull().references(() => flashcardDecks.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  state: mysqlEnum("state", ["new", "learning", "mastered"]).default("new").notNull(),
  nextReviewAt: timestamp("nextReviewAt"),
  lastReviewedAt: timestamp("lastReviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("flashcards_deck_state_idx").on(table.deckId, table.state)]);

export const calendarEvents = mysqlTable("calendarEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  eventType: mysqlEnum("eventType", ["important_date", "custom"]).default("important_date").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("calendarEvents_user_cycle_date_idx").on(table.userId, table.cycleId, table.startsAt)]);

export const lessonSources = mysqlTable("lessonSources", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 80 }).notNull(),
  platform: varchar("platform", { length: 180 }).notNull(),
  teacherName: varchar("teacherName", { length: 180 }).notNull(),
  delivery: mysqlEnum("delivery", ["online", "in_person", "hybrid"]).default("online").notNull(),
  role: mysqlEnum("role", ["primary", "review", "support"]).default("primary").notNull(),
  url: varchar("url", { length: 768 }),
  location: varchar("location", { length: 255 }),
  weeklyPlan: varchar("weeklyPlan", { length: 255 }),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("lessonSources_user_subject_idx").on(table.userId, table.subject), index("lessonSources_user_active_idx").on(table.userId, table.active)]);

export const rewards = mysqlTable("rewards", {
  id: int("id").autoincrement().primaryKey(),
  catalogId: int("catalogId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  cost: int("cost").notNull(),
  rarity: mysqlEnum("rarity", ["common", "uncommon", "rare", "epic", "legendary", "mythic"]).notNull(),
  active: boolean("active").default(true).notNull(),
}, table => [uniqueIndex("rewards_catalogId_unique").on(table.catalogId)]);

export const rewardPurchases = mysqlTable("rewardPurchases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  rewardId: int("rewardId").notNull().references(() => rewards.id, { onDelete: "restrict" }),
  cost: int("cost").notNull(),
  referenceKey: varchar("referenceKey", { length: 160 }).notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
}, table => [uniqueIndex("rewardPurchases_referenceKey_unique").on(table.referenceKey), index("rewardPurchases_user_cycle_idx").on(table.userId, table.cycleId)]);

export const achievements = mysqlTable("achievements", {
  id: int("id").autoincrement().primaryKey(),
  catalogId: int("catalogId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  rarity: mysqlEnum("rarity", ["common", "uncommon", "rare", "epic", "legendary", "mythic"]).notNull(),
  metric: varchar("metric", { length: 64 }).notNull(),
  target: int("target").notNull(),
}, table => [uniqueIndex("achievements_catalogId_unique").on(table.catalogId)]);

export const userAchievements = mysqlTable("userAchievements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  achievementId: int("achievementId").notNull().references(() => achievements.id, { onDelete: "cascade" }),
  unlockedAt: timestamp("unlockedAt").defaultNow().notNull(),
}, table => [uniqueIndex("userAchievements_cycle_achievement_unique").on(table.userId, table.cycleId, table.achievementId)]);

export const coinTransactions = mysqlTable("coinTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  amount: int("amount").notNull(),
  type: mysqlEnum("type", ["earn", "spend"]).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  referenceKey: varchar("referenceKey", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("coinTransactions_referenceKey_unique").on(table.referenceKey), index("coinTransactions_user_cycle_idx").on(table.userId, table.cycleId)]);

export const studyEvents = mysqlTable("studyEvents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  cycleId: int("cycleId").notNull().references(() => studyCycles.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").references(() => subjects.id, { onDelete: "set null" }),
  eventType: mysqlEnum("eventType", ["lesson_complete", "lesson_review", "task_complete", "habit_complete", "goal_complete", "pomodoro_complete", "video_block", "exam_complete"]).notNull(),
  referenceId: varchar("referenceId", { length: 100 }).notNull(),
  durationMinutes: int("durationMinutes").default(0).notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, table => [uniqueIndex("studyEvents_user_reference_unique").on(table.userId, table.referenceId), index("studyEvents_user_cycle_date_idx").on(table.userId, table.cycleId, table.occurredAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
