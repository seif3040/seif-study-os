import { studyClockSpans, type StudyClock, type StudySpan } from "./studyClock.js";
import { externalVideoDeadline, externalVideoElapsed } from "./videoTimer.js";

export type TimedStudyEvent = { kind: string; at: Date; minutes: number; reference: string; spans?: StudySpan[] };
export type StudyTimeRow = TimedStudyEvent & { id: number; projection?: true };

const minute = 60_000;
const videoSessionId = (reference: string) => Number(reference.match(/^video:(\d+):block:/)?.[1]);
const focusSessionId = (reference: string) => Number(reference.match(/^pomodoro:(\d+):complete$/)?.[1]);
type VideoClock = Parameters<typeof externalVideoElapsed>[0] & { id: number; createdAt: Date; updatedAt: Date };
type FocusClock = { id: number; startedAt: Date; pausedAt: Date | null; pausedSeconds: number; plannedMinutes: number; state?: string };

function timedRow(id: number, kind: string, reference: string, spans: StudySpan[]): StudyTimeRow | undefined {
  if (!spans.length) return;
  const minutes = spans.reduce((sum, span) => sum + (span.end - span.start) / minute, 0);
  if (minutes <= 0) return;
  return { id, at: new Date(spans.at(-1)!.end), kind, minutes, reference, spans, projection: true };
}

export function studyTimeWithSessions(
  events: StudyTimeRow[], videos: VideoClock[], focus: FocusClock[], now: Date, clocks: Record<string, StudyClock> = {},
): StudyTimeRow[] {
  const videoIds = new Set(videos.map(video => video.id));
  const focusEvents = new Map<number, StudyTimeRow>();
  const openFocus = new Map(focus.map(item => [item.id, item]));
  const rows = events.filter(event => {
    if (event.kind === "video_block" && videoIds.has(videoSessionId(event.reference))) return false;
    if (event.kind !== "pomodoro_complete") return true;
    const id = focusSessionId(event.reference);
    if (id) focusEvents.set(id, event);
    return !clocks["focus:" + id];
  });

  for (const video of videos) {
    const clock = clocks["video:" + video.id];
    const deadline = externalVideoDeadline(video);
    const end = deadline === null ? +(video.lastPlaybackAt ?? video.updatedAt) : Math.min(+now, deadline);
    // Old sessions lack playback spans. Cap the estimate at elapsed wall time
    // so a jump in the player cannot turn a few minutes into hours.
    const spans = clock ? studyClockSpans(clock, end) : [
      { start: Math.min(end, Math.max(+video.createdAt, end - externalVideoElapsed(video, +now) * 1000)), end },
    ];
    const row = timedRow(-2 * video.id, "video_block", "video:" + video.id, spans);
    if (row) rows.push(row);
  }

  for (const [key, clock] of Object.entries(clocks)) {
    if (!key.startsWith("focus:")) continue;
    const id = Number(key.slice(6));
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const event = focusEvents.get(id);
    const session = openFocus.get(id);
    if (!event && !session) continue;
    const end = session && session.state !== "cancelled" ? focusEnd(session, now) : undefined;
    const row = timedRow(event?.id ?? (-2 * id - 1), event?.kind ?? "pomodoro_running",
      event?.reference ?? key, studyClockSpans(clock, end));
    if (row) rows.push(row);
  }

  for (const session of focus) {
    if (session.state === "cancelled" || clocks["focus:" + session.id] || focusEvents.has(session.id)) continue;
    const end = focusEnd(session, now);
    const row = timedRow(-2 * session.id - 1, "pomodoro_running", "focus:" + session.id,
      [{ start: +session.startedAt + session.pausedSeconds * 1000, end }]);
    if (row) rows.push(row);
  }
  return rows;
}

function focusEnd(session: FocusClock, now: Date) {
  return Math.min(+(session.pausedAt ?? now), +session.startedAt + session.pausedSeconds * 1000 + session.plannedMinutes * minute);
}

export function splitStudyTimeAtMidnight(rows: StudyTimeRow[], dayOf: (date: Date) => string, nextMidnight: (day: string) => number) {
  return rows.flatMap(row => {
    if (!row.spans) return [row];
    const days = new Map<string, StudySpan[]>();
    for (const span of row.spans) {
      let start = span.start;
      while (start < span.end) {
        const day = dayOf(new Date(start));
        const end = Math.min(span.end, nextMidnight(day));
        if (end <= start) break;
        const spans = days.get(day) ?? [];
        spans.push({ start, end });
        days.set(day, spans);
        start = end;
      }
    }
    return Array.from(days.values()).flatMap(spans => {
      const part = timedRow(row.id, row.kind, row.reference, spans);
      return part ? [{ ...part, at: new Date(+part.at - 1) }] : [];
    });
  });
}

export function studyOverlapByDay(events: TimedStudyEvent[], dayOf: (date: Date) => string) {
  const focus: StudySpan[] = [];
  const videoRanges: (StudySpan & { at: Date })[] = [];
  const legacyVideos = new Map<string, { at: Date; minutes: number }>();
  for (const event of events) {
    if (Number(event.minutes) <= 0) continue;
    if (event.kind === "pomodoro_complete" || event.kind === "pomodoro_running") {
      focus.push(...(event.spans ?? [{ start: +event.at - event.minutes * minute, end: +event.at }]));
    } else if (event.kind === "video_block") {
      if (event.spans) {
        videoRanges.push(...event.spans.map(span => ({ ...span, at: event.at })));
      } else {
        const group = (videoSessionId(event.reference) || event.reference) + ":" + +event.at;
        const value = legacyVideos.get(group) ?? { at: event.at, minutes: 0 };
        value.minutes += Number(event.minutes);
        legacyVideos.set(group, value);
      }
    }
  }
  for (const range of Array.from(legacyVideos.values())) {
    videoRanges.push({ at: range.at, start: +range.at - range.minutes * minute, end: +range.at });
  }

  // Imported focus records can share timestamps. Keep their credited minutes
  // and use their combined coverage when deducting overlapping video time.
  const merged: StudySpan[] = [];
  for (const range of focus.sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && previous.end >= range.start) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }

  const overlap = new Map<string, number>();
  let videoCoveredUntil = -Infinity;
  let focusIndex = 0;
  for (const range of videoRanges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const start = Math.min(range.end, Math.max(range.start, videoCoveredUntil));
    let duplicate = Math.max(0, start - range.start);
    videoCoveredUntil = Math.max(videoCoveredUntil, range.end);
    while (focusIndex < merged.length && merged[focusIndex].end <= start) focusIndex++;
    for (let index = focusIndex; index < merged.length && merged[index].start < range.end; index++) {
      duplicate += Math.max(0, Math.min(range.end, merged[index].end) - Math.max(start, merged[index].start));
    }
    if (duplicate > 0) {
      const day = dayOf(range.at);
      overlap.set(day, (overlap.get(day) ?? 0) + duplicate / minute);
    }
  }
  return overlap;
}

export function totalStudyMinutes(
  events: StudyTimeRow[],
  dayOf: (date: Date) => string,
  baseline?: { minutes: number; throughEventId: number; recordedAt?: number },
) {
  const sum = (rows: TimedStudyEvent[]) => rows.reduce((total, event) => total + Number(event.minutes), 0);
  const overlap = (rows: TimedStudyEvent[]) =>
    Array.from(studyOverlapByDay(rows, dayOf).values()).reduce((total, minutes) => total + minutes, 0);
  if (!baseline) return Math.max(0, sum(events) - overlap(events));
  const cutoff = baseline.recordedAt ?? -Infinity;
  const existing = events.flatMap(event => {
    if (!event.projection) return event.id <= baseline.throughEventId ? [event] : [];
    const spans = event.spans?.filter(span => span.start < cutoff).map(span => ({ ...span, end: Math.min(span.end, cutoff) })) ?? [];
    const older = timedRow(event.id, event.kind, event.reference, spans);
    return older ? [older] : [];
  });
  return baseline.minutes + Math.max(0, sum(events) - sum(existing) - Math.max(0, overlap(events) - overlap(existing)));
}
