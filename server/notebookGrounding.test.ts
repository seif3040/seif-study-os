import { describe, expect, it } from "vitest";
import { notebookGroundingInstruction } from "./db";

describe("Notebook AI grounding", () => {
  it("requires answers to remain within the uploaded source material", () => {
    const instruction = notebookGroundingInstruction();
    expect(instruction).toContain("استخدم حصريًا النصوص والملفات المرفقة");
    expect(instruction).toContain("لا تستخدم معلومات خارجية");
    expect(instruction).toContain("المعلومة دي مش موجودة في الملفات المرفوعة");
  });
});
