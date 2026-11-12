(() => {
  const DB_NAME = "seif-study-offline";
  const SYNC_TAG = "seif-focus-pending";
  let connection;
  let syncing;

  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
        request.result.createObjectStore("queue", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    connection.catch(() => { connection = undefined; });
    return connection;
  }

  async function transaction(stores, mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error("تعذّر حفظ بيانات الأوفلاين."));
      try { run(tx, value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }

  const get = (key) => transaction(["state"], "readonly", (tx, result) => {
    const request = tx.objectStore("state").get(key);
    request.onsuccess = () => result(request.result);
  });

  function remember(snapshot) {
    return transaction(["state"], "readwrite", tx => tx.objectStore("state").put(snapshot, "snapshot"));
  }

  function forget() {
    return transaction(["state"], "readwrite", tx => tx.objectStore("state").delete("snapshot"));
  }

  function start(ownerId, minutes) {
    return transaction(["state"], "readwrite", (tx, result) => {
      const store = tx.objectStore("state");
      const storageKey = "timer:" + ownerId;
      const request = store.get(storageKey);
      request.onsuccess = () => {
        if (request.result) { result(request.result); return; }
        const timer = { ownerId, key: crypto.randomUUID(), minutes, startedAt: Date.now() };
        store.put(timer, storageKey);
        result(timer);
      };
    });
  }

  function finish(ownerId, key) {
    return transaction(["state", "queue"], "readwrite", (tx, result) => {
      const state = tx.objectStore("state");
      const storageKey = "timer:" + ownerId;
      const request = state.get(storageKey);
      request.onsuccess = () => {
        const timer = request.result;
        if (!timer || timer.key !== key) return;
        const completedAt = timer.startedAt + timer.minutes * 60_000;
        if (Date.now() < completedAt) return;
        tx.objectStore("queue").put({ ...timer, completedAt });
        state.delete(storageKey);
        result(true);
      };
    });
  }

  function cancel(ownerId, key) {
    return transaction(["state"], "readwrite", tx => {
      const state = tx.objectStore("state");
      const storageKey = "timer:" + ownerId;
      const request = state.get(storageKey);
      request.onsuccess = () => {
        if (request.result?.key === key) state.delete(storageKey);
      };
    });
  }

  function createTask(ownerId, title, day) {
    return transaction(["queue"], "readwrite", tx => {
      tx.objectStore("queue").put({ key: crypto.randomUUID(), kind: "task-create", ownerId, title, day, completedAt: Date.now() });
    });
  }

  function completeTask(ownerId, task) {
    return transaction(["queue"], "readwrite", tx => {
      tx.objectStore("queue").put({
        key: "task:" + ownerId + ":" + task.id,
        kind: "task",
        ownerId,
        taskId: task.id, expectedUpdatedAt: task.updatedAt, localTitle: task.title, localDay: task.day,
        completedAt: Date.now(),
      });
    });
  }

  function completeLesson(ownerId, lessonId) {
    return transaction(["queue"], "readwrite", tx => {
      tx.objectStore("queue").put({
        key: "lesson:" + ownerId + ":" + lessonId, kind: "lesson", ownerId, lessonId, completedAt: Date.now(),
      });
    });
  }

  function saveExam(ownerId, details) {
    return transaction(["queue"], "readwrite", tx => {
      tx.objectStore("queue").put({
        ...details, key: crypto.randomUUID(), kind: "exam", ownerId, completedAt: Date.now(),
      });
    });
  }

  function resolveTaskConflict(item, apply) {
    return transaction(["queue", "state"], "readwrite", tx => {
      const queue = tx.objectStore("queue");
      const request = queue.get(item.key);
      request.onsuccess = () => {
        const current = request.result;
        if (!current?.conflict || current.ownerId !== item.ownerId) return;
        if (!apply) {
          queue.delete(item.key);
          const state = tx.objectStore("state");
          const snapshot = state.get("snapshot");
          snapshot.onsuccess = () => {
            const currentSnapshot = snapshot.result;
            if (currentSnapshot?.ownerId !== item.ownerId) return;
            const latest = current.conflict;
            currentSnapshot.tasks = currentSnapshot.tasks.flatMap(task => task.id !== item.taskId ? [task]
              : latest.missing ? [] : [{ ...task, title: latest.title, day: latest.day, updatedAt: latest.updatedAt }]);
            state.put(currentSnapshot, "snapshot");
          };
          return;
        }
        const { conflict, ...retry } = current;
        queue.put({ ...retry, expectedUpdatedAt: conflict.updatedAt ?? retry.expectedUpdatedAt });
      };
    });
  }

  function queue() {
    return transaction(["queue"], "readonly", (tx, result) => {
      const request = tx.objectStore("queue").getAll();
      request.onsuccess = () => result(request.result);
    });
  }

  async function synchronize() {
    const snapshot = await get("snapshot");
    if (!snapshot) return 0;
    const active = await get("timer:" + snapshot.ownerId);
    if (active) await finish(snapshot.ownerId, active.key);
    const pending = (await queue()).filter(item => item.ownerId === snapshot.ownerId && !item.conflict)
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    let count = 0;
    let failed = false;
    for (const item of pending) {
      const { kind, syncIssue, ...payload } = item;
      const routes = {
        "task-create": ["tasks.syncCreate", "alreadySynced"],
        task: ["tasks.syncCompletion", "alreadyCompleted"],
        lesson: ["studyPlan.syncCompletion", "alreadyCompleted"],
        exam: ["exams.syncAttempt", "alreadySynced"],
      };
      const [route, receipt] = routes[kind] ?? ["pomodoro.syncOffline", "alreadySynced"];
      const response = await fetch("/api/trpc/" + route, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: payload }),
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 401 || response.status === 403) return count;
      if (!response.ok) {
        failed = true;
        await transaction(["queue"], "readwrite", tx => tx.objectStore("queue").put({ ...item, syncIssue: response.status }));
        continue;
      }
      const output = await response.json();
      const saved = output.result?.data?.json;
      if (kind === "task" && saved?.conflict) {
        await transaction(["queue"], "readwrite", tx => tx.objectStore("queue").put({ ...item, conflict: saved.conflict }));
        continue;
      }
      if (typeof saved?.[receipt] !== "boolean" || (kind === "task-create" && !Number.isSafeInteger(saved.taskId))) throw new Error("تعذّر تأكيد حفظ الجلسة.");
      await transaction(["queue", "state"], "readwrite", tx => {
        tx.objectStore("queue").delete(item.key);
        if (!["task", "task-create", "lesson"].includes(kind)) return;
        const state = tx.objectStore("state");
        const request = state.get("snapshot");
        request.onsuccess = () => {
          const current = request.result;
          if (current?.ownerId !== item.ownerId) return;
          if (kind === "lesson") current.lessons = (current.lessons ?? []).map(lesson => lesson.id === item.lessonId ? { ...lesson, completed: true } : lesson);
          else if (kind === "task") current.tasks = current.tasks.map(task => task.id === item.taskId ? { ...task, completed: true } : task);
          else if (!current.tasks.some(task => task.id === saved.taskId)) {
            current.tasks.push({ id: saved.taskId, title: item.title, completed: false, day: item.day, updatedAt: saved.updatedAt });
          }
          state.put(current, "snapshot");
        };
      });
      count++;
    }
    if (failed && !count) throw new Error("في تغييرات لسه مستنية المزامنة.");
    return count;
  }

  function sync() {
    if (!syncing) syncing = synchronize().finally(() => { syncing = undefined; });
    return syncing;
  }

  async function background() {
    if (!globalThis.navigator?.serviceWorker) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.sync) await registration.sync.register(SYNC_TAG);
  }

  globalThis.StudyOffline = { get, remember, forget, start, finish, cancel, createTask, completeTask, completeLesson, saveExam, resolveTaskConflict, queue, sync, background, SYNC_TAG };
})();
