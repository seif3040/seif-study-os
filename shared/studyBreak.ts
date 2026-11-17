import { plannerToday } from "./studyPlanner.js";

const hour = 60 * 60_000;

export function addBreakTime(totals: Record<string, number>, startedAt: number, endedAt: number) {
  const lastDay = plannerToday(new Date(endedAt));
  let cursor = startedAt;
  while (cursor < endedAt) {
    const day = plannerToday(new Date(cursor));
    let end = endedAt;
    if (day !== lastDay) {
      // Find the first instant of the next Cairo date, including clock changes.
      let low = cursor;
      let high = Math.min(endedAt, cursor + 26 * hour);
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (plannerToday(new Date(middle)) === day) low = middle;
        else high = middle;
      }
      end = high;
    }
    totals[day] = (totals[day] ?? 0) + end - cursor;
    cursor = end;
  }
}
