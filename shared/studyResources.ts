import { z } from "zod";

const id = z.string().uuid();
const title = z.string().trim().min(1).max(180);
const lesson = z.number().int().positive();
const bookBacklogModes = ["automatic", "branches", "manual"] as const;
export type BookBacklogMode = (typeof bookBacklogModes)[number];
export const bookSchema = z.object({
  id, title, subjectId: lesson, through: lesson.nullable(), backlog: z.array(lesson).max(300),
  backlogMode: z.enum(bookBacklogModes).optional(),
  branchThrough: z.record(z.string().regex(/^[1-9][0-9]*$/), lesson)
    .refine(value => Object.keys(value).length <= 300).optional(),
});
const homeworkDetails = z.object({ id, lessonId: lesson, prompt: z.string().trim().max(900) });
export const homeworkSchema = z.union([
  homeworkDetails.extend({ kind: z.literal("online"), platform: z.string().trim().min(1).max(180),
    sourceId: z.number().int().positive().optional(), rememberSite: z.boolean().optional(), siteUrl: z.string().trim().url().max(2000).optional(),
    url: z.string().trim().url().max(2000).refine(value => /^https?:\/\//i.test(value), "استخدم رابط http أو https.") }),
  homeworkDetails.extend({ kind: z.literal("book").optional(), bookId: id, pages: z.string().trim().min(1).max(120) }),
]);
export const mistakeSchema = z.object({
  id, subjectId: lesson, lessonId: lesson.optional(), question: z.string().trim().min(1).max(1500),
  kind: z.enum(["essay", "choice"]), options: z.array(z.string().trim().min(1).max(250)).max(6),
  answer: z.string().trim().max(1200),
}).superRefine((item, ctx) => {
  if (item.kind === "choice" && (item.options.length < 2 || new Set(item.options).size !== item.options.length || (item.answer && !item.options.includes(item.answer)))) {
    ctx.addIssue({ code: "custom", message: "اكتب اختيارين مختلفين على الأقل، ولو حددت إجابة تكون من الاختيارات." });
  }
});
export const studyResourceChange = z.discriminatedUnion("type", [
  z.object({ type: z.literal("book"), item: bookSchema }),
  z.object({ type: z.literal("homework"), item: homeworkSchema }),
  z.object({ type: z.literal("mistake"), item: mistakeSchema }),
  z.object({ type: z.literal("deleteMistake"), id }),
  z.object({ type: z.literal("check"), id, correct: z.boolean(), examId: lesson.optional() }),
  z.object({ type: z.literal("solveBookLesson"), id, lessonId: lesson }),
]);
export type StudyResources = {
  published?: Record<string, number>;
  books: (z.infer<typeof bookSchema> & { solvedLessonIds?: number[] })[];
  homework: z.infer<typeof homeworkSchema>[];
  mistakes: (z.infer<typeof mistakeSchema> & { due: string; streak: number; lastCorrect?: boolean; lastChecked?: string })[];
};
export type StudyResourceChange = z.infer<typeof studyResourceChange>;
export const emptyResources: StudyResources = { books: [], homework: [], mistakes: [] };

export function bookBacklogLessons(
  book: Pick<StudyResources["books"][number], "subjectId" | "through" | "backlogMode" | "branchThrough" | "solvedLessonIds">
    & { backlog?: number[] },
  rows: readonly { subject: { id: number }; chapter?: { id: number } | null; lesson: { id: number } | null; progress: { status: string } | null }[],
) {
  const lessons = rows.flatMap(row => row.subject.id === book.subjectId && row.lesson ? [{ ...row, lesson: row.lesson }] : []);
  if (book.backlogMode === "manual") {
    const marked = new Set(book.backlog);
    return lessons.filter(row => marked.has(row.lesson.id)).map(row => row.lesson.id);
  }
  const positions = new Map(lessons.map((row, index) => [row.lesson.id, index]));
  const solved = new Set(book.solvedLessonIds);
  return lessons.flatMap((row, index) => {
    const limit = book.backlogMode === "branches"
      ? row.chapter && book.branchThrough?.[row.chapter.id] : book.through;
    if (index <= (limit ? positions.get(limit) ?? -1 : -1)) return [];
    return row.progress?.status === "completed" && !solved.has(row.lesson.id) ? [row.lesson.id] : [];
  });
}

export function yearReviewDate(timestamp: number) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}

export const finalReviewDay = "2027-04-30";
export function reviewWeekday(day: string, offset: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function buildYearReviews(completedDay: string, lessonCount: number, today: string) {
  const first = reviewWeekday(completedDay, 7);
  if (first > finalReviewDay || lessonCount < 1) return [];
  const twoDays = lessonCount >= 24;
  const milestones = [
    { fraction: 1 / 4, label: "مراجعة ربع المنهج" },
    { fraction: 1 / 3, label: "مراجعة تلت المنهج" },
    { fraction: 1 / 2, label: "مراجعة نص المنهج" },
    { fraction: 1, label: "مراجعة المنهج كله" },
  ];
  const weeks = Math.floor((Date.parse(finalReviewDay) - Date.parse(first)) / 604800000) + 1;
  const offset = Math.max(0, Math.floor((Date.parse(today) - Date.parse(first)) / 604800000) - 1);
  const slots: { day: string; title: string; from: number; to: number }[] = [];
  for (let week = offset; week < Math.min(weeks, offset + 5); week++) {
    const phase = milestones[weeks === 1 ? 3 : Math.round(week * 3 / (weeks - 1))];
    const to = Math.max(1, Math.ceil(lessonCount * phase.fraction));
    const day = reviewWeekday(first, week * 7);
    const split = Math.ceil(to / 2);
    const secondDay = reviewWeekday(day, 3);
    const second = twoDays && to > 1 && secondDay <= finalReviewDay;
    slots.push({ day, title: phase.label, from: 1, to: second ? split : to });
    if (second) slots.push({ day: secondDay, title: phase.label, from: split + 1, to });
  }
  return slots;
}
