import { describe, expect, it } from "vitest";
import { isDirectMedia, youtubeEmbed } from "./videoSources";

describe("study video source handling", () => {
  it("converts supported YouTube links to privacy-enhanced embeds", () => {
    expect(youtubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeEmbed("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("accepts only direct browser-playable media extensions", () => {
    expect(isDirectMedia("https://cdn.example.com/lecture.mp4")).toBe(true);
    expect(isDirectMedia("https://cdn.example.com/lecture.webm?token=abc")).toBe(true);
    expect(isDirectMedia("https://drive.google.com/file/d/123/view")).toBe(false);
  });
});
