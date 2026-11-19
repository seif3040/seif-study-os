export type StudySpan = { start: number; end: number };
export type StudyClock = { spans: StudySpan[]; openedAt?: number };
export const videoHeartbeatTimeout = 15_000;

export function transitionStudyClock(clocks: Record<string, StudyClock>, key: string, endedAt: number, openedAt?: number, legacy?: StudySpan) {
  const clock = clocks[key] ??= { spans: legacy && legacy.end > legacy.start ? [legacy] : [] };
  if (clock.openedAt !== undefined && endedAt > clock.openedAt) {
    clock.spans.push({ start: clock.openedAt, end: endedAt });
  }
  if (openedAt === undefined) delete clock.openedAt;
  else clock.openedAt = openedAt;
}

export function studyClockSpans(clock: StudyClock, until?: number): StudySpan[] {
  return until !== undefined && clock.openedAt !== undefined && until > clock.openedAt
    ? [...clock.spans, { start: clock.openedAt, end: until }]
    : clock.spans;
}
