import { describe, expect, it } from "vitest";
import { splitStudyTimeAtMidnight, studyOverlapByDay, studyTimeWithSessions, totalStudyMinutes, type StudyTimeRow } from "../shared/studyTime";
import { videoRemainderReward } from "../shared/videoTimer";

const start = new Date("2026-11-19T10:00:00Z");
const at = (minute: number) => new Date(+start + minute * 60_000);
const day = () => "2026-11-19";
const focusEvent = (id: number, end: number, minutes: number): StudyTimeRow =>
  ({ id, kind: "pomodoro_complete", reference: "pomodoro:" + id + ":complete", at: at(end), minutes });
const video = (id: number, from: number, end: number, minutes: number) =>
  ({ id, createdAt: at(from), updatedAt: at(end), activeSeconds: minutes * 60, lastPlaybackAt: null, timerRunning: false, completedBlocks: Math.floor(minutes / 45) });

describe("combined study time", () => {
  it("includes video below 45 minutes and time after the last full block", () => {
    const rows = studyTimeWithSessions([
      { id: 1, kind: "video_block", reference: "video:3:block:1", at: at(45), minutes: 45 },
    ], [video(3, 0, 50, 50), video(4, 55, 85, 30)], [], at(85));
    expect(rows.filter(row => row.projection).map(row => row.minutes)).toEqual([50, 30]);
    expect(totalStudyMinutes(rows, day)).toBe(80);
  });

  it("counts overlapping video and focus once and adds study outside the overlap", () => {
    const rows = studyTimeWithSessions([focusEvent(1, 60, 60), focusEvent(2, 125, 45)], [
      video(3, 20, 50, 30), video(4, 50, 75, 25), video(5, 65, 75, 10),
    ], [], at(125));
    expect(studyOverlapByDay(rows, day).get(day())).toBe(50);
    expect(totalStudyMinutes(rows, day)).toBe(120);
  });

  it("includes only elapsed time in a paused Pomodoro and keeps the historical total", () => {
    const rows = studyTimeWithSessions([focusEvent(1, 10, 10)], [
      video(2, 0, 5, 5), video(3, 15, 22, 7),
    ], [{ id: 4, startedAt: at(18), plannedMinutes: 60, pausedSeconds: 120, pausedAt: at(25) }], at(60));
    expect(totalStudyMinutes(rows, day, { minutes: 26148, throughEventId: 1, recordedAt: +at(12) })).toBe(26158);
  });

  it("includes a manual video timer before its first reward", () => {
    const timer = { ...video(3, 0, 0, 0), timerRunning: true, lastPlaybackAt: at(0) };
    const rows = studyTimeWithSessions([], [timer], [], at(12));
    expect(totalStudyMinutes(rows, day)).toBe(12);
  });
});

it("uses recorded playback time instead of seek position and respects focus pauses", () => {
  const rows = studyTimeWithSessions([focusEvent(1, 60, 50)], [video(3, 0, 55, 120)], [], at(60), {
    "video:3": { spans: [{ start: +at(15), end: +at(25) }, { start: +at(35), end: +at(55) }] },
    "focus:1": { spans: [{ start: +at(0), end: +at(20) }, { start: +at(30), end: +at(60) }] },
  });
  expect(rows.find(row => row.kind === "video_block")?.minutes).toBe(30);
  expect(studyOverlapByDay(rows, day).get(day())).toBe(25);
  expect(totalStudyMinutes(rows, day)).toBe(55);
});

it("splits a single playback across Cairo days", () => {
  const previous = new Date("2026-11-19T21:55:00Z");
  const end = new Date("2026-11-19T22:05:00Z");
  const rows = studyTimeWithSessions([], [{
    ...video(3, 0, 0, 10), createdAt: previous, updatedAt: end,
  }], [], end, { "video:3": { spans: [{ start: +previous, end: +end }] } });
  const dayOf = (date: Date) => new Date(+date + 7_200_000).toISOString().slice(0, 10);
  const split = splitStudyTimeAtMidnight(rows, dayOf, day => +new Date(day + "T22:00:00Z"));
  expect(split.map(row => [dayOf(row.at), row.minutes])).toEqual([["2026-11-19", 5], ["2026-11-20", 5]]);
});

it("awards the chosen rate proportionally without rewarding a completed block twice", () => {
  expect(videoRemainderReward(40 * 60, 0, 200)).toBe(178);
  expect(videoRemainderReward(50 * 60, 1, 200)).toBe(22);
  expect(videoRemainderReward(45 * 60, 1, 200)).toBe(0);
  expect(videoRemainderReward(20 * 60, 0, 0)).toBe(0);
});
