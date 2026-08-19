import { listLLMModels, invokeLLM } from "./_core/llm";
import { createGoal, createHabit, createTask, deleteGoal, deleteHabit, deleteTask, listGoals, listHabits, listTasks, updateGoal, updateHabit, updateTask } from "./db";

export const personalAssistantActionTypes = ["none", "add_task", "update_task", "delete_task", "add_habit", "update_habit", "delete_habit", "add_goal", "update_goal", "delete_goal", "navigate"] as const;
export type PersonalAssistantActionType = typeof personalAssistantActionTypes[number];
export type PersonalAssistantPlan = {
  reply: string;
  actionType: PersonalAssistantActionType;
  title: string;
  targetTitle: string;
  priority: "urgent" | "medium" | "low";
  frequency: "daily" | "weekly";
  target: number;
  route: "" | "/tasks" | "/habits" | "/goals" | "/study-plan" | "/exams" | "/pomodoro" | "/notebooks" | "/analytics";
  requiresConfirmation: boolean;
};

const FALLBACK_PLAN: PersonalAssistantPlan = { reply: "أنا معاك يا سيف. قولي طلب واضح زي: ضيف مهمة مراجعة فيزياء، غيّر اسم عادة السهر، أو امسح هدف قديم.", actionType: "none", title: "", targetTitle: "", priority: "medium", frequency: "daily", target: 1, route: "", requiresConfirmation: false };
const isActionType = (value: unknown): value is PersonalAssistantActionType => typeof value === "string" && (personalAssistantActionTypes as readonly string[]).includes(value);
const isRoute = (value: unknown): value is PersonalAssistantPlan["route"] => ["", "/tasks", "/habits", "/goals", "/study-plan", "/exams", "/pomodoro", "/notebooks", "/analytics"].includes(String(value));

export function normalizePersonalAssistantPlan(input: unknown): PersonalAssistantPlan {
  const value = input as Partial<PersonalAssistantPlan>;
  const actionType = isActionType(value?.actionType) ? value.actionType : "none";
  const title = typeof value?.title === "string" ? value.title.trim().slice(0, 200) : "";
  const targetTitle = typeof value?.targetTitle === "string" ? value.targetTitle.trim().slice(0, 200) : "";
  const isMutation = actionType !== "none" && actionType !== "navigate";
  const isEdit = actionType.startsWith("update_");
  if (isMutation && (!title || (isEdit && !targetTitle))) return { ...FALLBACK_PLAN, reply: isEdit ? "محتاج الاسم القديم والجديد. مثال: غيّر مهمة حل الواجب إلى حل واجب الفيزياء." : "محتاج اسم الحاجة الأول عشان أنفّذها. مثال: ضيف مهمة اسمها حل واجب الفيزياء.", actionType: "none" };
  return {
    reply: typeof value?.reply === "string" && value.reply.trim() ? value.reply.trim().slice(0, 1200) : FALLBACK_PLAN.reply,
    actionType,
    title,
    targetTitle,
    priority: value?.priority === "urgent" || value?.priority === "low" ? value.priority : "medium",
    frequency: value?.frequency === "weekly" ? "weekly" : "daily",
    target: Math.max(1, Math.min(7, Number.isInteger(value?.target) ? Number(value.target) : 1)),
    route: isRoute(value?.route) ? value.route : "",
    requiresConfirmation: isMutation,
  };
}

export async function planPersonalAssistantAction(userId: number, request: string): Promise<PersonalAssistantPlan> {
  try {
    const { data: models } = await listLLMModels();
    const model = models.find(model => model.id === "gpt-5-mini")?.id ?? models[0]?.id;
    const response = await invokeLLM({
      model,
      messages: [
        { role: "system", content: "You are Seify, a personal study assistant inside Seif Study OS. Reply in friendly Egyptian Arabic. Understand only these actions: add/update/delete task, add/update/delete habit, add/update/delete goal, or navigate to a study page. Updates rename an existing item, so title is the new name and targetTitle is the existing name. Never claim an action has already happened: you only propose it. For any add, edit, or deletion, explain the proposed change briefly and wait for the user to press confirmation. For normal questions, help briefly and set actionType none. Do not invent data or make financial, medical, legal, or account changes." },
        { role: "user", content: `طلب الطالب: ${request}\nحوّل الطلب لخطة منظمة.` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "personal_study_assistant_plan", strict: true, schema: { type: "object", properties: { reply: { type: "string" }, actionType: { type: "string", enum: [...personalAssistantActionTypes] }, title: { type: "string" }, targetTitle: { type: "string" }, priority: { type: "string", enum: ["urgent", "medium", "low"] }, frequency: { type: "string", enum: ["daily", "weekly"] }, target: { type: "integer", minimum: 1, maximum: 7 }, route: { type: "string", enum: ["", "/tasks", "/habits", "/goals", "/study-plan", "/exams", "/pomodoro", "/notebooks", "/analytics"] }, requiresConfirmation: { type: "boolean" } }, required: ["reply", "actionType", "title", "targetTitle", "priority", "frequency", "target", "route", "requiresConfirmation"], additionalProperties: false } } },
    });
    return normalizePersonalAssistantPlan(JSON.parse(String(response.choices[0]?.message?.content ?? "{}")));
  } catch {
    return FALLBACK_PLAN;
  }
}

function findByTitle<T extends { id: number }>(items: T[], title: string, getTitle: (item: T) => string) {
  return items.find(item => getTitle(item).trim().toLocaleLowerCase("ar-EG") === title.trim().toLocaleLowerCase("ar-EG"));
}

export async function executePersonalAssistantAction(userId: number, plan: PersonalAssistantPlan, confirmed: boolean) {
  const safe = normalizePersonalAssistantPlan(plan);
  if (safe.actionType === "none" || safe.actionType === "navigate") throw new Error("مفيش تعديل قابل للتنفيذ في الطلب ده.");
  if (!confirmed) throw new Error("أكد التعديل الأول قبل ما أنفّذه.");
  if (safe.actionType === "add_task") { await createTask(userId, { title: safe.title, priority: safe.priority }); return { message: `اتعملت مهمة «${safe.title}».`, kind: "task" as const }; }
  if (safe.actionType === "update_task") { const item = findByTitle(await listTasks(userId), safe.targetTitle, task => task.title); if (!item) throw new Error("ملقتش مهمة بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateTask(userId, item.id, { title: safe.title, description: item.description ?? undefined, scheduledFor: item.scheduledFor ?? undefined, deadline: item.deadline ?? undefined, priority: item.priority, category: item.category ?? undefined }); return { message: `اتغير اسم المهمة من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "task" as const }; }
  if (safe.actionType === "add_habit") { await createHabit(userId, { name: safe.title, frequency: safe.frequency, target: safe.target }); return { message: `اتضافت عادة «${safe.title}».`, kind: "habit" as const }; }
  if (safe.actionType === "update_habit") { const item = findByTitle((await listHabits(userId)).items, safe.targetTitle, habit => habit.name); if (!item) throw new Error("ملقتش عادة بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateHabit(userId, item.id, { name: safe.title, frequency: item.frequency, target: item.target }); return { message: `اتغير اسم العادة من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "habit" as const }; }
  if (safe.actionType === "add_goal") { await createGoal(userId, { title: safe.title }); return { message: `اتضاف هدف «${safe.title}».`, kind: "goal" as const }; }
  if (safe.actionType === "update_goal") { const item = findByTitle(await listGoals(userId), safe.targetTitle, goal => goal.title); if (!item) throw new Error("ملقتش هدف بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateGoal(userId, item.id, { title: safe.title, description: item.description ?? undefined, deadline: item.deadline ?? undefined }); return { message: `اتغير اسم الهدف من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "goal" as const }; }
  if (safe.actionType === "delete_task") { const item = findByTitle(await listTasks(userId), safe.title, task => task.title); if (!item) throw new Error("ملقتش مهمة بالاسم ده. اكتب الاسم زي ما هو ظاهر عندك."); await deleteTask(userId, item.id); return { message: `اتشالت مهمة «${safe.title}».`, kind: "task" as const }; }
  if (safe.actionType === "delete_habit") { const habits = (await listHabits(userId)).items; const item = findByTitle(habits, safe.title, habit => habit.name); if (!item) throw new Error("ملقتش عادة بالاسم ده. اكتب الاسم زي ما هو ظاهر عندك."); await deleteHabit(userId, item.id); return { message: `اتشالت عادة «${safe.title}».`, kind: "habit" as const }; }
  const item = findByTitle(await listGoals(userId), safe.title, goal => goal.title); if (!item) throw new Error("ملقتش هدف بالاسم ده. اكتب الاسم زي ما هو ظاهر عندك."); await deleteGoal(userId, item.id); return { message: `اتشال هدف «${safe.title}».`, kind: "goal" as const };
}
