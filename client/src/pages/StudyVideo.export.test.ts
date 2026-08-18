import { describe, expect, it } from "vitest";
import { formatVideoNotesText } from "./StudyVideo";

describe("formatVideoNotesText", () => {
  it("includes the video URL, watch metrics, Arabic note content, and timestamp", () => {
    const text = formatVideoNotesText({
      id: 7,
      videoUrl: "https://www.youtube.com/watch?v=abc1234",
      activeSeconds: 3723,
      completedBlocks: 2,
      phase: "completed",
      updatedAt: new Date("2026-08-18T00:00:00.000Z"),
      notes: [{ id: 1, title: "قانون مهم", content: "راجع هذه النقطة قبل الامتحان", timestampSeconds: 95, updatedAt: new Date("2026-08-18T00:00:00.000Z") }],
    });

    expect(text).toContain("https://www.youtube.com/watch?v=abc1234");
    expect(text).toContain("01:02:03");
    expect(text).toContain("قانون مهم");
    expect(text).toContain("راجع هذه النقطة قبل الامتحان");
    expect(text).toContain("عند 00:01:35");
  });
});
