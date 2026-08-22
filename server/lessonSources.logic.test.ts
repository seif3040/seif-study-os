import { describe, expect, it } from "vitest";
import { seifLessonSourceDefaults } from "../shared/lessonSources";

describe("Seif lesson source defaults", () => {
  it("keeps the known sources and complementary history roles", () => {
    expect(seifLessonSourceDefaults).toHaveLength(7);
    expect(seifLessonSourceDefaults.find(source => source.teacherName === "أحمد غنيم")).toMatchObject({ subject: "التاريخ", delivery: "in_person", role: "primary" });
    expect(seifLessonSourceDefaults.find(source => source.teacherName === "نادر الجورج")).toMatchObject({ subject: "التاريخ", delivery: "online", role: "review" });
    expect(seifLessonSourceDefaults.find(source => source.teacherName === "جينو")).toMatchObject({ subject: "الإنجليزي", delivery: "online", role: "review" });
    expect(seifLessonSourceDefaults.find(source => source.teacherName === "فراو بسنت")).toMatchObject({ subject: "الألماني", delivery: "online", role: "primary" });
    expect(seifLessonSourceDefaults.map(source => source.subject)).toEqual(expect.arrayContaining(["العربي", "التاريخ", "البرمجة", "الإنجليزي"]));
  });
});
