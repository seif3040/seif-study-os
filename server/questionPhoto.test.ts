import { expect, it } from "vitest";
import { questionFromText } from "../shared/questionPhoto";
import { studyResourceChange } from "../shared/studyResources";

it("copies visible Arabic options and an explicitly marked answer", () => {
  expect(questionFromText("من قادت العمل النسائي؟\nأ) هدى شعراوي\nب أم كلثوم\nالإجابة الصحيحة: (أ)")).toEqual({
    question: "من قادت العمل النسائي؟", options: ["هدى شعراوي", "أم كلثوم"], answer: "هدى شعراوي",
  });
});

it("allows saving a question without inventing an answer and validates deletion IDs", () => {
  const transcript = questionFromText("Choose the correct word.\nA. red\nB. blue");
  expect(transcript).toEqual({ question: "Choose the correct word.", options: ["red", "blue"], answer: "" });
  const id = "12345678-1234-4234-8234-123456789abc";
  expect(studyResourceChange.safeParse({ type: "mistake", item: { ...transcript, id, kind: "choice", subjectId: 2, lessonId: 3 } }).success).toBe(true);
  expect(studyResourceChange.safeParse({ type: "deleteMistake", id }).success).toBe(true);
  expect(studyResourceChange.safeParse({ type: "deleteMistake", id: "bad" }).success).toBe(false);
});
