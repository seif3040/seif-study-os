import { plannerMinutes, plannerWeekday, shiftPlannerDay, slotOccurs, type PlannerSlot } from "./studyPlanner.js";

export type ExamScheduleOptions = {
  kind: "lesson" | "comprehensive";
  repeatWeekly: boolean;
  duringClass: boolean;
  durationMinutes: number;
};

export const defaultExamSchedule: ExamScheduleOptions = {
  kind: "lesson", repeatWeekly: false, duringClass: true, durationMinutes: 60,
};

const cairoDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const cairoClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const cairoOffset = new Intl.DateTimeFormat("en", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" });

export function examLocalDate(date: Date) {
  return cairoDate.format(date) + "T" + cairoClock.format(date);
}

export function cairoPlannerTime(day: string, time: string) {
  const utc = Date.parse(day + "T" + time + ":00Z");
  const zone = cairoOffset.formatToParts(new Date(utc)).find(part => part.type === "timeZoneName")?.value;
  const offset = zone?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "+02:00";
  return new Date(day + "T" + time + ":00" + offset);
}

export function examClock(minutes: number) {
  return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, "0")).join(":");
}

type ScheduledExam = { id: number; title: string; subjectId: number | null; scheduledAt: Date | null; scheduleOptions: ExamScheduleOptions | null };
export function examOccurrences<T extends ScheduledExam>(exams: readonly T[], first: string, last: string, slots: readonly PlannerSlot[]) {
  const occurrences = [];
  for (const exam of exams) {
    if (!exam.scheduledAt) continue;
    const [anchor, clock] = examLocalDate(exam.scheduledAt).split("T");
    for (let day = first > anchor ? first : anchor; day <= last; day = shiftPlannerDay(day, 1)) {
      if (day !== anchor && (!exam.scheduleOptions?.repeatWeekly || plannerWeekday(day) !== plannerWeekday(anchor))) continue;
      const matching = slots.filter(slot => slot.subjectId === exam.subjectId && slotOccurs(slot, day));
      const coincides = matching.find(slot => slot.start <= clock && clock < slot.end);
      const duringClass = exam.scheduleOptions?.duringClass;
      const slot = duringClass ? coincides ?? matching.sort((a, b) => a.start.localeCompare(b.start))[0] : duringClass === false ? undefined : coincides;
      const start = slot?.start ?? clock;
      const startAt = cairoPlannerTime(day, start);
      const endAt = slot ? cairoPlannerTime(day, slot.end) : new Date(+startAt + (exam.scheduleOptions?.durationMinutes ?? 60) * 60_000);
      occurrences.push({ ...exam, day, scheduledAt: startAt, endAt, inClass: Boolean(slot) });
      if (!exam.scheduleOptions?.repeatWeekly) break;
    }
  }
  return occurrences.sort((a, b) => +a.scheduledAt - +b.scheduledAt || a.id - b.id);
}
