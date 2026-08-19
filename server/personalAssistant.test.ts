import { describe, expect, it } from "vitest";
import { normalizePersonalAssistantPlan } from "./personalAssistant";

describe("personal assistant command safety", () => {
  it("requires confirmation for every data mutation even if the model omits it", () => {
    const plan = normalizePersonalAssistantPlan({ reply: "هضيف المهمة", actionType: "add_task", title: "مراجعة الفيزياء", targetTitle: "", priority: "medium", frequency: "daily", target: 1, route: "", requiresConfirmation: false });
    expect(plan).toMatchObject({ actionType: "add_task", title: "مراجعة الفيزياء", requiresConfirmation: true });
  });

  it("does not expose an executable action when the requested record has no name", () => {
    const plan = normalizePersonalAssistantPlan({ reply: "امسح المهمة", actionType: "delete_task", title: "", targetTitle: "", priority: "medium", frequency: "daily", target: 1, route: "", requiresConfirmation: true });
    expect(plan.actionType).toBe("none");
    expect(plan.reply).toContain("محتاج اسم الحاجة");
  });

  it("requires old and new names before proposing a confirmed edit", () => {
    const plan = normalizePersonalAssistantPlan({ reply: "هغيّرها", actionType: "update_task", title: "المهمة الجديدة", targetTitle: "", priority: "medium", frequency: "daily", target: 1, route: "", requiresConfirmation: false });
    expect(plan.actionType).toBe("none");
    expect(plan.reply).toContain("الاسم القديم والجديد");
  });
});
