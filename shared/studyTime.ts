export type TimedStudyEvent = { kind: string; at: Date; minutes: number; reference: string };

const minute = 60_000;
type Interval = { start: number; end: number };

function mergeIntervals(intervals: Interval[]) {
  const result: Interval[] = [];
  for (const interval of intervals.sort((first, second) => first.start - second.start)) {
    const previous = result.at(-1);
    if (previous && previous.end >= interval.start) previous.end = Math.max(previous.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

export function studyOverlapByDay(events: TimedStudyEvent[], dayOf: (date: Date) => string) {
  // Historical events store the finish time and credited minutes, so infer the
  // study interval leading up to completion. Batched video blocks are contiguous.
  const focus = mergeIntervals(events.filter(event => event.kind === "pomodoro_complete" && Number(event.minutes) > 0)
    .map(event => ({ start: +event.at - Number(event.minutes) * minute, end: +event.at })));
  const video = new Map<string, { at: Date; minutes: number }>();
  for (const event of events) {
    if (event.kind !== "video_block" || Number(event.minutes) <= 0) continue;
    const group = (event.reference.match(/^video:(\d+):block:/)?.[1] ?? event.reference) + ":" + +event.at;
    const value = video.get(group) ?? { at: event.at, minutes: 0 };
    value.minutes += Number(event.minutes);
    video.set(group, value);
  }
  const rangesByDay = new Map<string, Interval[]>();
  let coveredUntil = -Infinity;
  const videoRanges = Array.from(video.values()).sort((a, b) => (+a.at - a.minutes * minute) - (+b.at - b.minutes * minute));
  for (const event of videoRanges) {
    const day = dayOf(event.at);
    const ranges = rangesByDay.get(day) ?? [];
    const start = Math.max(coveredUntil, +event.at - event.minutes * minute);
    if (start >= +event.at) continue;
    ranges.push({ start, end: +event.at });
    coveredUntil = +event.at;
    rangesByDay.set(day, ranges);
  }
  const overlap = new Map<string, number>();
  for (const [day, ranges] of rangesByDay) {
    let duration = 0;
    for (const range of ranges) {
      let low = 0;
      let high = focus.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (focus[middle].end <= range.start) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < focus.length && focus[index].start < range.end; index++) {
        duration += Math.min(range.end, focus[index].end) - Math.max(range.start, focus[index].start);
      }
    }
    overlap.set(day, duration / minute);
  }
  return overlap;
}

export function totalStudyMinutes(
  events: (TimedStudyEvent & { id: number })[],
  dayOf: (date: Date) => string,
  baseline?: { minutes: number; throughEventId: number },
) {
  const sum = (rows: TimedStudyEvent[]) => rows.reduce((total, event) => total + Number(event.minutes), 0);
  const overlap = (rows: TimedStudyEvent[]) =>
    Array.from(studyOverlapByDay(rows, dayOf).values()).reduce((total, minutes) => total + minutes, 0);
  if (!baseline) return Math.max(0, sum(events) - overlap(events));
  const existing = events.filter(event => event.id <= baseline.throughEventId);
  const added = events.filter(event => event.id > baseline.throughEventId);
  return baseline.minutes + Math.max(0, sum(added) - Math.max(0, overlap(events) - overlap(existing)));
}
