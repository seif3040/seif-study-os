import { z } from "zod";

const id = z.string().uuid();
const title = z.string().trim().min(1).max(180);
const lesson = z.number().int().positive();
export const bookSchema = z.object({ id, title, subjectId: lesson, through: lesson.nullable(), backlog: z.array(lesson).max(300) });
export const homeworkSchema = z.object({ id, bookId: id, lessonId: lesson, pages: z.string().trim().min(1).max(120), prompt: z.string().trim().max(900) });
export const mistakeSchema = z.object({
  id, subjectId: lesson, question: z.string().trim().min(1).max(1500),
  kind: z.enum(["essay", "choice"]), options: z.array(z.string().trim().min(1).max(250)).max(6),
  answer: z.string().trim().min(1).max(1200),
}).superRefine((item, ctx) => {
  if (item.kind === "choice" && (item.options.length < 2 || new Set(item.options).size !== item.options.length || !item.options.includes(item.answer))) {
    ctx.addIssue({ code: "custom", message: "اكتب اختيارين مختلفين على الأقل وحدد الإجابة الصحيحة." });
  }
});
export const studyResourceChange = z.discriminatedUnion("type", [
  z.object({ type: z.literal("book"), item: bookSchema }),
  z.object({ type: z.literal("homework"), item: homeworkSchema }),
  z.object({ type: z.literal("mistake"), item: mistakeSchema }),
  z.object({ type: z.literal("check"), id, correct: z.boolean() }),
]);
export type StudyResources = {
  published?: Record<string, number>;
  books: z.infer<typeof bookSchema>[];
  homework: z.infer<typeof homeworkSchema>[];
  mistakes: (z.infer<typeof mistakeSchema> & { due: string; streak: number })[];
};
export type StudyResourceChange = z.infer<typeof studyResourceChange>;
export const emptyResources: StudyResources = { books: [], homework: [], mistakes: [] };

export const finalReviewDay = "2027-06-21";
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
