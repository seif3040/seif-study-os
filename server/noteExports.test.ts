import { describe, expect, it } from "vitest";
import { formatVideoNotesText } from "../client/src/pages/StudyVideo";

describe("video note export", () => {
  it("preserves metadata, Arabic text, and playback timestamps in TXT output", () => {
    const output = formatVideoNotesText({ id: 1, videoUrl: "https://www.youtube.com/watch?v=abc1234", activeSeconds: 3723, completedBlocks: 2, phase: "completed", updatedAt: new Date("2026-08-18T00:00:00.000Z"), notes: [{ id: 2, title: "قانون مهم", content: "راجع دي قبل الامتحان", timestampSeconds: 95, updatedAt: new Date("2026-08-18T00:00:00.000Z") }] });
    expect(output).toContain("https://www.youtube.com/watch?v=abc1234");
    expect(output).toContain("01:02:03");
    expect(output).toContain("قانون مهم");
    expect(output).toContain("عند 00:01:35");
  });
});
