(() => {
  const store = globalThis.StudyOffline;
  const byId = id => document.getElementById(id);
  const focus = byId("focus");
  const clock = byId("clock");
  const minutes = byId("minutes");
  const start = byId("start");
  const cancel = byId("cancel");
  const status = byId("status");
  const pending = byId("pending");
  let snapshot;
  let timer;
  let busy = false;

  function showError() {
    status.textContent = "تعذّر الوصول لتخزين الجهاز. افتح الموقع من متصفح بيسمح بحفظ البيانات.";
  }

  async function refreshPending() {
    const items = (await store.queue()).filter(item => item.ownerId === snapshot.ownerId);
    pending.textContent = items.length ? "تغييرات مستنية المزامنة: " + items.length.toLocaleString("ar-EG") : "مفيش تغييرات مستنية المزامنة.";
    const latest = await store.get("snapshot");
    if (latest?.ownerId === snapshot.ownerId) snapshot = latest;
    renderTasks(items);
    renderStudy(items);
    renderConflicts(items);
  }

  function renderTasks(items) {
    const list = byId("tasks");
    list.replaceChildren();
    for (const task of snapshot.tasks) {
      const item = document.createElement("li");
      const pendingTask = items.some(entry => entry.kind === "task" && entry.taskId === task.id);
      item.textContent = task.title + (task.day ? " (" + task.day + ")" : "") + (pendingTask ? " — مستني المزامنة" : task.completed ? " ✓" : "");
      if (task.id && !task.completed && !pendingTask) {
        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = "خلصت";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await store.completeTask(snapshot.ownerId, task);
            await refreshPending();
            await store.background().catch(() => undefined);
            await sync();
          } catch { showError(); button.disabled = false; }
        });
        item.append(" ", button);
      }
      list.append(item);
    }
    const additions = items.filter(item => item.kind === "task-create");
    for (const addition of additions) {
      const entry = document.createElement("li");
      entry.textContent = addition.title + " — مهمة جديدة مستنية المزامنة";
      list.append(entry);
    }
    if (!snapshot.tasks.length && !additions.length) list.textContent = "مفيش مهام في الجدول المحفوظ.";
  }

  function renderConflicts(items) {
    const section = byId("task-conflicts");
    const list = byId("task-conflict-items");
    const conflicts = items.filter(item => item.kind === "task" && item.conflict);
    section.hidden = !conflicts.length;
    list.replaceChildren();
    for (const item of conflicts) {
      const line = document.createElement("li");
      const latest = item.conflict;
      const description = document.createElement("p");
      description.textContent = "على الجهاز: " + (item.localTitle ?? "المهمة") + (item.localDay ? "، " + item.localDay : "") + " — مكتملة";
      const server = document.createElement("p");
      server.textContent = latest.missing ? "على الخادم: المهمة اتحذفت أو اتنقلت للسلة."
        : "على الخادم: " + latest.title + (latest.day ? "، " + latest.day : "") + " — لسه مفتوحة";
      line.append(description, server);
      const choices = [
        [true, latest.missing ? "جرّب تاني بعد الاسترجاع" : "علّم نسخة الخادم كمكتملة"],
        [false, "احتفظ بنسخة الخادم"],
      ];
      for (const [apply, label] of choices) {
        const button = document.createElement("button");
        button.textContent = label;
        button.className = apply ? "" : "secondary";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await store.resolveTaskConflict(item, apply);
            await refreshPending();
            if (apply) await sync();
          } catch { showError(); button.disabled = false; }
        });
        line.append(button, " ");
      }
      list.append(line);
    }
  }

  function setOptions(id, rows) {
    const select = byId(id);
    const last = select.value;
    select.replaceChildren(new Option("اختار من القائمة", ""));
    for (const row of rows) select.add(new Option(row.label, row.id));
    if (rows.some(row => String(row.id) === last)) select.value = last;
    select.disabled = !rows.length;
  }

  function renderStudy(items) {
    byId("offline-study").hidden = false;
    const lessons = (snapshot.lessons ?? []).filter(lesson => !lesson.completed &&
      !items.some(item => item.kind === "lesson" && item.lessonId === lesson.id));
    const exams = snapshot.exams ?? [];
    setOptions("lesson-choice", lessons.map(lesson => ({ id: lesson.id, label: lesson.subject + " · " + lesson.title })));
    setOptions("exam-choice", exams.map(exam => ({ id: exam.id, label: exam.title })));
    byId("lesson-submit").disabled = !lessons.length;
    byId("exam-submit").disabled = !exams.length;
    const list = byId("offline-study-pending");
    list.replaceChildren();
    for (const item of items) {
      const source = item.kind === "lesson" ? snapshot.lessons?.find(lesson => lesson.id === item.lessonId)
        : item.kind === "exam" ? exams.find(exam => exam.id === item.examId) : null;
      if (item.kind !== "lesson" && item.kind !== "exam") continue;
      const line = document.createElement("li");
      line.textContent = (source?.title ?? (item.kind === "lesson" ? "درس" : "امتحان")) + " — مستني المزامنة";
      list.append(line);
    }
  }

  async function sync() {
    byId("connection").textContent = navigator.onLine ? "متصل" : "بدون نت";
    if (!snapshot) return;
    try {
      if (navigator.onLine) {
        const saved = await store.sync();
        if (saved) status.textContent = "التغييرات اتسجّلت في قاعدة البيانات.";
      }
    } catch {
      status.textContent = "التغييرات محفوظة على الجهاز. هنحاول نبعتها تاني لما الاتصال يبقى متاح.";
    }
    await refreshPending();
  }

  async function render() {
    if (!snapshot || busy) return;
    busy = true;
    try {
      timer = await store.get("timer:" + snapshot.ownerId);
      const remaining = timer ? Math.max(0, Math.ceil((timer.startedAt + timer.minutes * 60_000 - Date.now()) / 1000)) : Number(minutes.value) * 60;
      clock.textContent = String(Math.floor(remaining / 60)).padStart(2, "0") + ":" + String(remaining % 60).padStart(2, "0");
      minutes.disabled = !!timer;
      start.disabled = !!timer;
      cancel.hidden = !timer;
      if (timer && remaining === 0 && await store.finish(snapshot.ownerId, timer.key)) {
        status.textContent = "الجلسة اتحفظت على الجهاز.";
        await store.background().catch(() => undefined);
        await sync();
      }
    } catch { showError(); }
    finally { busy = false; }
  }

  start.addEventListener("click", async () => {
    if (!snapshot) return;
    start.disabled = true;
    try { await store.start(snapshot.ownerId, Number(minutes.value)); await render(); }
    catch { showError(); start.disabled = false; }
  });
  cancel.addEventListener("click", async () => {
    try { if (timer) await store.cancel(snapshot.ownerId, timer.key); await render(); }
    catch { showError(); }
  });
  byId("new-task-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!snapshot) return;
    const input = byId("new-task-title");
    const submit = byId("new-task-submit");
    const title = input.value.trim();
    if (!title) return;
    submit.disabled = true;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const day = [fields.year, fields.month, fields.day].join("-");
      await store.createTask(snapshot.ownerId, title, day);
      input.value = "";
      await refreshPending();
      await store.background().catch(() => undefined);
      await sync();
    } catch { showError(); }
    finally { submit.disabled = false; }
  });

  byId("lesson-form").addEventListener("submit", async event => {
    event.preventDefault();
    const id = Number(byId("lesson-choice").value);
    if (!snapshot || !id) return;
    byId("lesson-submit").disabled = true;
    try {
      await store.completeLesson(snapshot.ownerId, id);
      await refreshPending();
      await store.background().catch(() => undefined);
      await sync();
    } catch { showError(); }
  });

  byId("exam-form").addEventListener("submit", async event => {
    event.preventDefault();
    const examId = Number(byId("exam-choice").value);
    const totalQuestions = Number(byId("exam-total").value);
    const correctAnswers = Number(byId("exam-correct").value);
    const missedTopics = byId("exam-missed").value.split(/\r?\n/).map(topic => topic.trim()).filter(Boolean);
    if (!snapshot || !examId) return;
    if (correctAnswers > totalQuestions || missedTopics.length > 40 || missedTopics.some(topic => topic.length > 120)) {
      status.textContent = "راجع عدد الإجابات الصح والموضوعات. كل موضوع حتى ١٢٠ حرف والحد ٤٠ موضوع.";
      return;
    }
    byId("exam-submit").disabled = true;
    try {
      await store.saveExam(snapshot.ownerId, {
        examId, totalQuestions, correctAnswers, difficulty: byId("exam-difficulty").value, missedTopics,
      });
      event.target.reset();
      await refreshPending();
      await store.background().catch(() => undefined);
      await sync();
    } catch { showError(); }
  });

  minutes.addEventListener("change", () => void render());
  window.addEventListener("online", () => void sync().catch(showError));
  window.addEventListener("offline", () => void sync().catch(showError));

  async function initialize() {
    snapshot = await store.get("snapshot");
    if (!snapshot) {
      status.textContent = "افتح الموقع وسجّل دخولك مع وجود إنترنت مرة واحدة لتجهيز وضع الأوفلاين.";
      return;
    }
    focus.hidden = false;
    const schedule = byId("schedule");
    if (snapshot.savedAt) {
      schedule.hidden = false;
      byId("schedule-date").textContent = new Date(snapshot.savedAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
      if (snapshot.exam) byId("exam").textContent = "أقرب امتحان: " + snapshot.exam;
    }
    status.textContent = "جلساتك بتتحفظ على الجهاز وتتزامن لما الإنترنت يرجع.";
    await render();
    await sync();
    window.setInterval(() => void render(), 1000);
    window.setInterval(() => void sync().catch(showError), 30_000);
  }

  initialize().catch(showError);
})();
