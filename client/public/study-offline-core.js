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

  function completeTask(ownerId, taskId) {
    return transaction(["queue"], "readwrite", tx => {
      tx.objectStore("queue").put({
        key: "task:" + ownerId + ":" + taskId,
        kind: "task",
        ownerId,
        taskId,
        completedAt: Date.now(),
      });
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
    const pending = (await queue()).filter(item => item.ownerId === snapshot.ownerId)
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    let count = 0;
    for (const item of pending) {
      const isTask = item.kind === "task";
      const route = isTask ? "tasks.syncCompletion" : "pomodoro.syncOffline";
      const payload = isTask ? { ownerId: item.ownerId, taskId: item.taskId, completedAt: item.completedAt } : item;
      const response = await fetch("/api/trpc/" + route, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: payload }),
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 401 || response.status === 403) return count;
      if (!response.ok) throw new Error("جلسة مستنية المزامنة (" + response.status + ").");
      const output = await response.json();
      if (typeof output.result?.data?.json?.[isTask ? "alreadyCompleted" : "alreadySynced"] !== "boolean") throw new Error("تعذّر تأكيد حفظ الجلسة.");
      await transaction(["queue", "state"], "readwrite", tx => {
        tx.objectStore("queue").delete(item.key);
        if (!isTask) return;
        const state = tx.objectStore("state");
        const request = state.get("snapshot");
        request.onsuccess = () => {
          const current = request.result;
          if (current?.ownerId !== item.ownerId) return;
          current.tasks = current.tasks.map(task => task.id === item.taskId ? { ...task, completed: true } : task);
          state.put(current, "snapshot");
        };
      });
      count++;
    }
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

  globalThis.StudyOffline = { get, remember, forget, start, finish, cancel, completeTask, queue, sync, background, SYNC_TAG };
})();
