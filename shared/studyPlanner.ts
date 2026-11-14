export const plannerDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type PlannerSlot = {
  id: string;
  weekday: number;
  everyOtherWeekFrom?: string;
  dateOverrides?: Record<string, boolean>;
  start: string;
  end: string;
  title: string;
  subjectId?: number;
  sourceId?: number;
};

export type PlannerAttendance = {
  slotId: string;
  day: string;
  subjectId: number;
  lessonId: number;
  lessonTitle: string;
};

export type PlannerMilestone = {
  id: string;
  title: string;
  duration?: number;
  eventId?: number;
  day?: string;
  start?: string;
  minutes?: number;
  follows?: string;
};

export type PlannerState = {
  backlog?: number[];
  assessments?: Record<number, import('./assessments.js').AssessmentStatus>;
  backlogSubjects?: Record<string, number>;
  teacherNext?: Record<number, number>;
  studySessions?: PlannedStudy[];
  dailyPrompt?: { day: string; outcome: 'approved' | 'skipped' };
  wake: string;
  sleep: string;
  slots: PlannerSlot[];
  attendance: PlannerAttendance[];
  milestones: PlannerMilestone[];
};

export const emptyPlanner: PlannerState = {
  wake: "07:00", sleep: "23:00", slots: [], attendance: [], milestones: [],
};

export function shiftPlannerDay(day: string, offset: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function plannerWeekday(day: string) {
  return new Date(day + "T12:00:00Z").getUTCDay();
}

export function plannerToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function plannerMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function plannerFreeTime(wake: string, sleep: string, slots: PlannerSlot[]) {
  let cursor = plannerMinutes(wake);
  const finish = plannerMinutes(sleep);
  const gaps: { start: number; end: number }[] = [];
  for (const slot of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const start = Math.min(finish, plannerMinutes(slot.start));
    if (start > cursor) gaps.push({ start: cursor, end: start });
    cursor = Math.max(cursor, Math.min(finish, plannerMinutes(slot.end)));
  }
  if (cursor < finish) gaps.push({ start: cursor, end: finish });
  return gaps;
}

export function overlapsPlannerSlot(slot: PlannerSlot, slots: PlannerSlot[]) {
  return slots.some(other => other.id !== slot.id && other.weekday === slot.weekday && slot.start < other.end && other.start < slot.end);
}

export function plannerPolicy(title: string) {
  const name = title.trim().replace(/^ال/, "").replace(/[أإآ]/g, "ا");
  if (name === "عربي") return "arabic";
  if (name === "تاريخ") return "history";
  if (name === "برمجة") return "programming";
  if (name === "انجليزي") return "english";
  return "standard";
}

export function upcomingClassLessons<T extends { lesson: {id:number} | null; progress: {status:string} | null }>(
  rows: T[], state: PlannerState, subjectId: number,
) {
  const attended = new Set(state.attendance.map(item => item.lessonId));
  const cursor = state.teacherNext?.[subjectId];
  const index = rows.findIndex(row => row.lesson?.id === cursor);
  return rows.slice(Math.max(0, index)).filter(row => row.lesson && !state.backlog?.includes(row.lesson.id)
    && !attended.has(row.lesson.id) && (index >= 0 || row.progress?.status !== "completed"));
}

export type PlannedStudy = {
  id: string;
  day: string;
  start: string;
  end: string;
  title: string;
  kind: "homework" | "review" | "backlog" | "study";
  lessonId?: number;
  done?: boolean;
};
export function studySlots(state: PlannerState, day: string) {
  const weekday = plannerWeekday(day);
  return (state.studySessions ?? []).filter(item => item.day === day).map(item => ({ ...item, weekday }));
}

export function slotOccurs(slot: PlannerSlot, day: string) {
  if (slot.weekday !== plannerWeekday(day)) return false;
  const override = slot.dateOverrides?.[day];
  if (override !== undefined) return override;
  const anchor = slot.everyOtherWeekFrom;
  if (!anchor) return true;
  const days = (Date.parse(day) - Date.parse(anchor)) / 86_400_000;
  return days >= 0 && days % 14 === 0;
}
