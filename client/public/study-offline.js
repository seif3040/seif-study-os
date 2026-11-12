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
    const count = (await store.queue()).filter(item => item.ownerId === snapshot.ownerId).length;
    pending.textContent = count ? "جلسات مستنية المزامنة: " + count.toLocaleString("ar-EG") : "مفيش جلسات مستنية المزامنة.";
  }

  async function sync() {
    byId("connection").textContent = navigator.onLine ? "متصل" : "بدون نت";
    if (!snapshot) return;
    try {
      if (navigator.onLine) {
        const saved = await store.sync();
        if (saved) status.textContent = "الجلسات اتسجّلت في قاعدة البيانات.";
      }
    } catch {
      status.textContent = "الجلسات محفوظة على الجهاز. هنحاول نبعتها تاني لما الاتصال يبقى متاح.";
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
      for (const task of snapshot.tasks) {
        const item = document.createElement("li");
        item.textContent = task.title + (task.completed ? " ✓" : "");
        byId("tasks").append(item);
      }
      if (!snapshot.tasks.length) byId("tasks").textContent = "مفيش مهام في الجدول المحفوظ.";
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
