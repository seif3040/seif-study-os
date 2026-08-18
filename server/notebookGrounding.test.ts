import { describe, expect, it } from "vitest";
import { notebookGroundingInstruction, parseNotebookQuiz } from "./db";

describe("Notebook AI grounding", () => {
  it("requires answers to remain within the uploaded source material", () => {
    const instruction = notebookGroundingInstruction();
    expect(instruction).toContain("استخدم حصريًا النصوص والملفات المرفقة");
    expect(instruction).toContain("لا تستخدم معلومات خارجية");
    expect(instruction).toContain("المعلومة دي مش موجودة في الملفات المرفوعة");
  });

  it("accepts a complete eight-question file-grounded quiz before it is persisted", () => {
    const questions = Array.from({ length: 8 }, (_, index) => ({ question: `سؤال ${index + 1}`, answer: `إجابة ${index + 1}` }));
    expect(parseNotebookQuiz(JSON.stringify({ questions }))).toEqual({ questions });
  });

  it("rejects malformed or incomplete quiz payloads", () => {
    expect(() => parseNotebookQuiz(JSON.stringify({ questions: [{ question: "سؤال", answer: "إجابة" }] }))).toThrow("تعذر إنشاء امتحان صالح");
  });
});
