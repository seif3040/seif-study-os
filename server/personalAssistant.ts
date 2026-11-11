import { hasStudyAI, invokeLLM } from "./_core/llm.js";
import { completeLesson, completeTask, createChapter, createExam, createGoal, createHabit, createLesson, createReward, createSubject, createTask, dashboard, listAssistantMessages, ownedAssistantChat, listExams, listGoals, listHabits, listPomodoros, listRewards, listStudyPlan, listTasks, saveAssistantMessage, setExamArchived, setRewardActive, startPomodoro, updateGoal, updateHabit, updateTask } from "./db.js";

export const personalAssistantActionTypes = ["none", "add_task", "update_task", "reschedule_task", "reprioritize_task", "delete_task", "add_habit", "update_habit", "delete_habit", "add_goal", "update_goal", "delete_goal", "navigate", "complete_task", "add_subject", "add_chapter", "add_lesson", "complete_lesson", "add_exam", "archive_exam", "restore_exam", "add_reward", "hide_reward", "restore_reward", "start_focus"] as const;
export const personalAssistantRoutes = ["","/","/tasks","/calendar","/lesson-sources","/study-plan","/exams","/pomodoro","/focus-lounge","/study-video","/habits","/analytics","/rewards","/coins","/settings"] as const;
export type PersonalAssistantActionType = typeof personalAssistantActionTypes[number];
export type PersonalAssistantPlan = {
  reply: string;
  actionType: PersonalAssistantActionType;
  title: string;
  targetTitle: string;
  priority: "urgent" | "medium" | "low";
  scheduledFor: string;
  frequency: "daily" | "weekly";
  target: number;
  route: typeof personalAssistantRoutes[number];
  parentTitle?: string;
  value?: number;
  requiresConfirmation: boolean;
};

const FALLBACK_PLAN: PersonalAssistantPlan = { reply: "أنا معاك يا سيف. قولي طلب واضح زي: ضيف مهمة مراجعة فيزياء، غيّر موعد مهمة، أو ضيف مادة جديدة.", actionType: "none", title: "", targetTitle: "", priority: "medium", scheduledFor: "", frequency: "daily", target: 1, route: "", requiresConfirmation: false };
const isActionType = (value: unknown): value is PersonalAssistantActionType => typeof value === "string" && (personalAssistantActionTypes as readonly string[]).includes(value);
const isRoute = (value: unknown): value is PersonalAssistantPlan["route"] => (personalAssistantRoutes as readonly string[]).includes(String(value));

export function normalizePersonalAssistantPlan(input: unknown): PersonalAssistantPlan {
  const value = input as Partial<PersonalAssistantPlan>;
  const actionType = isActionType(value?.actionType) ? value.actionType : "none";
  const title = typeof value?.title === "string" ? value.title.trim().slice(0, 200) : "";
  const targetTitle = typeof value?.targetTitle === "string" ? value.targetTitle.trim().slice(0, 200) : "";
  const suppliedDate = typeof value?.scheduledFor === "string" ? value.scheduledFor : "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(suppliedDate) ? new Date(suppliedDate + "T00:00:00Z") : null;
  const scheduledFor = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === suppliedDate ? suppliedDate : "";
  if (suppliedDate && !scheduledFor && ["add_task", "add_exam", "reschedule_task"].includes(actionType)) {
    return { ...FALLBACK_PLAN, reply: "التاريخ ده مش واضح. قولي اليوم والشهر والسنة." };
  }
  const parentTitle = typeof value?.parentTitle === "string" ? value.parentTitle.trim().slice(0, 200) : "";
  const number = Number.isInteger(value?.value) ? Math.max(0, Math.min(1_000_000, Number(value.value))) : 0;
  if (actionType.startsWith("delete_")) return { ...FALLBACK_PLAN, reply: "ممكن أرشف امتحان أو أخفي هدية مع الاحتفاظ بسجلها. الحذف النهائي مش متاح من سيفي." };
  const isMutation = actionType !== "none" && actionType !== "navigate";
  const isEdit = actionType.startsWith("update_");
  const requiresExistingTask = actionType === "reschedule_task" || actionType === "reprioritize_task";
  if (isMutation && ((actionType !== "start_focus" && !title) || (["add_chapter", "add_lesson"].includes(actionType) && !parentTitle) || (actionType === "add_reward" && number < 1) || (actionType === "start_focus" && ![15, 25, 45, 60].includes(number)) || (isEdit && !targetTitle) || (requiresExistingTask && !targetTitle) || (actionType === "reschedule_task" && !scheduledFor))) return { ...FALLBACK_PLAN, reply: actionType === "reschedule_task" ? "محتاج اسم المهمة واليوم الجديد بصيغة واضحة. مثال: خلّي مهمة حل الواجب يوم 2026-08-20." : isEdit ? "محتاج الاسم القديم والجديد. مثال: غيّر مهمة حل الواجب إلى حل واجب الفيزياء." : "محتاج اسم الحاجة الأول عشان أنفّذها. مثال: ضيف مهمة اسمها حل واجب الفيزياء.", actionType: "none" };
  return {
    reply: typeof value?.reply === "string" && value.reply.trim() ? value.reply.trim().slice(0, 1200) : FALLBACK_PLAN.reply,
    actionType,
    title,
    targetTitle,
    priority: value?.priority === "urgent" || value?.priority === "low" ? value.priority : "medium",
    scheduledFor,
    frequency: value?.frequency === "weekly" ? "weekly" : "daily",
    target: Math.max(1, Math.min(7, Number.isInteger(value?.target) ? Number(value.target) : 1)),
    route: isRoute(value?.route) ? value.route : "",
    parentTitle,
    value: number,
    requiresConfirmation: isMutation,
  };
}

export async function planPersonalAssistantAction(userId: number, request: string, page = "", shareWithOpenRouter = false, chatId?: number, includeChatHistory = false): Promise<PersonalAssistantPlan> {
  if (!hasStudyAI()) return { ...FALLBACK_PLAN, reply: "سيفي محتاج إعداد OpenRouter عشان يرد." };
  if (chatId !== undefined) await ownedAssistantChat(userId, chatId);
  const history = shareWithOpenRouter && includeChatHistory && chatId !== undefined ? await listAssistantMessages(userId, 8, chatId) : [];
  try {
    await saveAssistantMessage(userId, "user", request, chatId);
    const normalized = request.trim().replace(/[؟?!.]/g, "").replace(/\s+/g, " ");
    const isBalance = /^(رصيدي كام|رصيد الكوينز كام|معايا كام كوينز)$/.test(normalized);
    const isProgress = /^(لخص تقدّمي|لخص تقدمي|قولي تقدّمي في خطة المنهج|ذاكرت كام ساعة)$/.test(normalized);
    const isExams = /^(عندي كام امتحان جاي)$/.test(normalized);
    if (isBalance || isProgress || isExams) {
      const { coins, metrics, upcomingExams } = await dashboard(userId);
      const format = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });
      const reply = isBalance ? "رصيدك الحالي " + format.format(coins.balance) + " Coins."
        : isExams ? "عندك " + format.format(upcomingExams.length) + (upcomingExams.length === 4 ? " امتحانات على الأقل في المواعيد الجاية." : " امتحانات في المواعيد الجاية.")
        : "سجلّك فيه " + format.format(metrics.studyMinutes / 60) + " ساعة مذاكرة، و" + format.format(metrics.lessonsCompleted) + " درس مكتمل، و" + format.format(metrics.tasksCompleted) + " مهمة مكتملة.";
      await saveAssistantMessage(userId, "assistant", reply, chatId);
      return { ...FALLBACK_PLAN, reply };
    }
    if (!shareWithOpenRouter) return { ...FALLBACK_PLAN, reply: "فعّل إرسال الرسالة إلى OpenRouter عشان سيفي يقدر يرد." };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
    const response = await invokeLLM({
      maxTokens: 600,
      messages: [
        { role: "system", content: "You are Seify, a personal study assistant for Seif Study OS. Reply in Egyptian Arabic. Propose at most one action; only a user confirmation in the app executes it. Never claim anything was saved before confirmation. You receive the current page and the student's current message. Previous messages may be included when explicitly authorized. Do not invent record titles, costs, dates or results. Ask for the exact title when uncertain. Use title for the requested record or new name, targetTitle for the original name when updating, and parentTitle for the subject when creating a chapter or the chapter when creating a lesson. For complete_lesson, parentTitle can identify the chapter. scheduledFor is YYYY-MM-DD (Cairo); for add_task and add_exam it can be blank. For start_focus, value must be 15, 25, 45 or 60 minutes. For add_lesson, value is duration or 0 for 30 minutes. For add_reward, value is the confirmed price in Coins. Don't award arbitrary Coins, purchase, permanently delete, change account settings or send data anywhere else. Use archive_exam, restore_exam, hide_reward and restore_reward for reversible changes. For unsupported requests explain the limit and help navigate. For normal questions use actionType none. Return a JSON object with keys reply, actionType, title, targetTitle, parentTitle, value, priority, scheduledFor, frequency, target, route, requiresConfirmation." },
        ...history.map(message => ({ role: message.role, content: message.content.slice(0, 1200) })),
        { role: "user", content: `تاريخ القاهرة: ${today}\nالصفحة: ${isRoute(page) ? page : ""}\nطلب الطالب: ${request}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "personal_study_assistant_plan", strict: true, schema: { type: "object", properties: { reply: { type: "string" }, actionType: { type: "string", enum: personalAssistantActionTypes.filter(action => !action.startsWith("delete_")) }, title: { type: "string" }, targetTitle: { type: "string" }, parentTitle: { type: "string" }, value: { type: "integer" }, priority: { type: "string", enum: ["urgent", "medium", "low"] }, scheduledFor: { type: "string" }, frequency: { type: "string", enum: ["daily", "weekly"] }, target: { type: "integer", minimum: 1, maximum: 7 }, route: { type: "string", enum: [...personalAssistantRoutes] }, requiresConfirmation: { type: "boolean" } }, required: ["reply", "actionType", "title", "targetTitle", "parentTitle", "value", "priority", "scheduledFor", "frequency", "target", "route", "requiresConfirmation"], additionalProperties: false } } },
    }, { openRouter: true });
    const plan = normalizePersonalAssistantPlan(JSON.parse(String(response.choices[0]?.message?.content ?? "{}")));
    await saveAssistantMessage(userId, "assistant", plan.reply, chatId);
    return plan;
  } catch {
    const reply = "OpenRouter مش قادر يرد دلوقتي. جرّب تاني بعد شوية.";
    await saveAssistantMessage(userId, "assistant", reply, chatId).catch(() => undefined);
    return { ...FALLBACK_PLAN, reply };
  }
}

function findByTitle<T extends { id: number }>(items: T[], title: string, getTitle: (item: T) => string) {
  const matches = items.filter(item => getTitle(item).trim().toLocaleLowerCase("ar-EG") === title.trim().toLocaleLowerCase("ar-EG"));
  if (matches.length > 1) throw new Error("في أكتر من سجل بنفس الاسم. حدّده من الصفحة نفسها.");
  return matches[0];
}

export async function executePersonalAssistantAction(userId: number, plan: PersonalAssistantPlan, confirmed: boolean, canManageRewards = false) {
  const safe = normalizePersonalAssistantPlan(plan);
  if (safe.actionType === "none" || safe.actionType === "navigate") throw new Error("مفيش تعديل قابل للتنفيذ في الطلب ده.");
  if (!confirmed) throw new Error("أكد التعديل الأول قبل ما أنفّذه.");
  if (safe.actionType === "add_task") { await createTask(userId, { title: safe.title, priority: safe.priority, scheduledFor: safe.scheduledFor || undefined }); return { message: `اتعملت مهمة «${safe.title}».`, kind: "task" as const }; }
  if (safe.actionType === "reschedule_task") { const item = findByTitle(await listTasks(userId), safe.targetTitle, task => task.title); if (!item) throw new Error("ملقتش مهمة بالاسم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateTask(userId, item.id, { title: item.title, description: item.description ?? undefined, scheduledFor: safe.scheduledFor, deadline: item.deadline ?? undefined, priority: item.priority, category: item.category ?? undefined }); return { message: `اتنقلت مهمة «${item.title}» ليوم ${safe.scheduledFor}.`, kind: "task" as const }; }
  if (safe.actionType === "reprioritize_task") { const item = findByTitle(await listTasks(userId), safe.targetTitle, task => task.title); if (!item) throw new Error("ملقتش مهمة بالاسم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateTask(userId, item.id, { title: item.title, description: item.description ?? undefined, scheduledFor: item.scheduledFor ?? undefined, deadline: item.deadline ?? undefined, priority: safe.priority, category: item.category ?? undefined }); return { message: `اتغيرت أولوية «${item.title}» لـ ${safe.priority === "urgent" ? "مهم" : safe.priority === "low" ? "خفيف" : "متوسط"}.`, kind: "task" as const }; }
  if (safe.actionType === "update_task") { const item = findByTitle(await listTasks(userId), safe.targetTitle, task => task.title); if (!item) throw new Error("ملقتش مهمة بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateTask(userId, item.id, { title: safe.title, description: item.description ?? undefined, scheduledFor: item.scheduledFor ?? undefined, deadline: item.deadline ?? undefined, priority: item.priority, category: item.category ?? undefined }); return { message: `اتغير اسم المهمة من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "task" as const }; }
  if (safe.actionType === "add_habit") { await createHabit(userId, { name: safe.title, frequency: safe.frequency, target: safe.target }); return { message: `اتضافت عادة «${safe.title}».`, kind: "habit" as const }; }
  if (safe.actionType === "update_habit") { const item = findByTitle((await listHabits(userId)).items, safe.targetTitle, habit => habit.name); if (!item) throw new Error("ملقتش عادة بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateHabit(userId, item.id, { name: safe.title, frequency: item.frequency, target: item.target }); return { message: `اتغير اسم العادة من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "habit" as const }; }
  if (safe.actionType === "add_goal") { await createGoal(userId, { title: safe.title }); return { message: `اتضاف هدف «${safe.title}».`, kind: "goal" as const }; }
  if (safe.actionType === "update_goal") { const item = findByTitle(await listGoals(userId), safe.targetTitle, goal => goal.title); if (!item) throw new Error("ملقتش هدف بالاسم القديم ده. اكتب الاسم زي ما هو ظاهر عندك."); await updateGoal(userId, item.id, { title: safe.title, description: item.description ?? undefined, deadline: item.deadline ?? undefined }); return { message: `اتغير اسم الهدف من «${safe.targetTitle}» إلى «${safe.title}».`, kind: "goal" as const }; }
  if (safe.actionType === "complete_task") {
    const item = findByTitle(await listTasks(userId), safe.title, task => task.title);
    if (!item) throw new Error("المهمة مش موجودة.");
    const result = await completeTask(userId, item.id);
    return { message: result.alreadyCompleted ? "المهمة مكتملة بالفعل." : `اتعلّمت مهمة «${item.title}» كمكتملة.`, kind: "task" as const };
  }
  if (safe.actionType === "add_subject") {
    await createSubject(userId, { title: safe.title.slice(0, 160) });
    return { message: `اتضافت مادة «${safe.title}».`, kind: "study" as const };
  }
  if (safe.actionType === "add_chapter" || safe.actionType === "add_lesson" || safe.actionType === "complete_lesson") {
    const { rows } = await listStudyPlan(userId);
    if (safe.actionType === "add_chapter") {
      const subjects = [...new Map(rows.map(row => [row.subject.id, row.subject])).values()];
      const subject = findByTitle(subjects, safe.parentTitle ?? "", item => item.title);
      if (!subject) throw new Error("المادة مش موجودة.");
      await createChapter(userId, { subjectId: subject.id, title: safe.title.slice(0, 180) });
    } else if (safe.actionType === "add_lesson") {
      const chapters = [...new Map(rows.flatMap(row => row.chapter ? [[row.chapter.id, row.chapter] as const] : [])).values()];
      const chapter = findByTitle(chapters, safe.parentTitle ?? "", item => item.title);
      if (!chapter) throw new Error("الفصل مش موجود.");
      await createLesson(userId, { chapterId: chapter.id, title: safe.title, estimatedMinutes: Math.min(600, Math.max(5, safe.value || 30)) });
    } else {
      const candidates = rows.flatMap(row => row.lesson && (!safe.parentTitle || row.chapter?.title === safe.parentTitle) ? [row.lesson] : []);
      const lesson = findByTitle(candidates, safe.title, item => item.title);
      if (!lesson) throw new Error("الدرس مش موجود.");
      const result = await completeLesson(userId, lesson.id);
      if (result.alreadyCompleted) return { message: "الدرس مكتمل بالفعل.", kind: "study" as const };
    }
    return { message: `تم ${safe.actionType === "complete_lesson" ? "إكمال" : "إضافة"} «${safe.title}».`, kind: "study" as const };
  }
  if (safe.actionType === "add_exam") {
    await createExam(userId, { title: safe.title, scheduledAt: safe.scheduledFor ? new Date(safe.scheduledFor + "T12:00:00Z") : undefined });
    return { message: `اتضاف امتحان «${safe.title}».`, kind: "exam" as const };
  }
  if (safe.actionType === "archive_exam" || safe.actionType === "restore_exam") {
    const archived = safe.actionType === "archive_exam";
    const exams = (await listExams(userId)).map(item => item.exam).filter(item => Boolean(item.archivedAt) !== archived);
    const exam = findByTitle(exams, safe.title, item => item.title);
    if (!exam) throw new Error("الامتحان مش موجود في القائمة المطلوبة.");
    await setExamArchived(userId, exam.id, archived);
    return { message: archived ? "الامتحان اتنقل للأرشيف." : "الامتحان رجع للقائمة.", kind: "exam" as const };
  }
  if (safe.actionType === "add_reward" || safe.actionType === "hide_reward" || safe.actionType === "restore_reward") {
    if (!canManageRewards) throw new Error("حسابك مش مسموح له بإدارة الهدايا.");
    if (safe.actionType === "add_reward") {
      await createReward(userId, { title: safe.title, cost: safe.value!, rarity: "common" });
      return { message: `اتضافت هدية «${safe.title}».`, kind: "reward" as const };
    }
    const catalog = await listRewards(userId, true);
    const restore = safe.actionType === "restore_reward";
    const item = findByTitle(restore ? catalog.archived : catalog.items, safe.title, reward => reward.title);
    if (!item) throw new Error("الهدية مش موجودة في القائمة المطلوبة.");
    await setRewardActive(item.id, restore);
    return { message: restore ? "الهدية رجعت للقائمة." : "الهدية اتشالت من القائمة مع حفظ سجلها.", kind: "reward" as const };
  }
  if (safe.actionType === "start_focus") {
    const minutes = safe.value;
    if (minutes !== 15 && minutes !== 25 && minutes !== 45 && minutes !== 60) throw new Error("اختار مدة ١٥ أو ٢٥ أو ٤٥ أو ٦٠ دقيقة.");
    const [latest] = await listPomodoros(userId);
    if (latest?.state === "running" || latest?.state === "paused") throw new Error("في جلسة مفتوحة بالفعل.");
    await startPomodoro(userId, { plannedMinutes: minutes });
    return { message: `بدأت جلسة تركيز ${minutes} دقيقة.`, kind: "focus" as const };
  }
  throw new Error("الإجراء ده غير متاح.");
}
