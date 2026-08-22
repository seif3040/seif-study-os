import { describe, expect, it } from "vitest";
import { classifyStudySource, isDirectMedia, safeStudyUrl, youtubeEmbed } from "../client/src/lib/videoSources";

describe("study video source handling", () => {
  it("converts supported YouTube links to privacy-enhanced embeds", () => {
    expect(youtubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeEmbed("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("accepts direct browser-playable media but rejects page URLs", () => {
    expect(isDirectMedia("https://cdn.example.com/lecture.mp4")).toBe(true);
    expect(isDirectMedia("https://cdn.example.com/lecture.webm?token=abc")).toBe(true);
    expect(isDirectMedia("https://drive.google.com/file/d/123/view")).toBe(false);
  });

  it("routes course pages safely to an external study session and rejects unsafe links", () => {
    expect(classifyStudySource("https://bassthalk.com/course/physics/lesson-1")).toBe("external");
    expect(classifyStudySource("https://cdn.example.com/lesson.webm")).toBe("embedded");
    expect(classifyStudySource("javascript:alert(1)")).toBe("invalid");
    expect(classifyStudySource("notaurl")).toBe("invalid");
    expect(safeStudyUrl("ftp://example.com/lesson.mp4")).toBeNull();
  });
});
