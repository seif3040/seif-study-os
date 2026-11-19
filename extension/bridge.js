(() => {
  if (globalThis.seifStudyBridge) return;
  globalThis.seifStudyBridge = true;
  const origin = location.origin;
  const requests = new Map();

  function post(type, data) {
    window.postMessage({ type: "seif-study-extension:" + type, ...data }, origin);
  }

  async function read({ url, id, list }) {
    const data = await chrome.runtime.sendMessage({ type: list ? "list" : "read", url });
    post("progress", { id, data, list });
  }

  async function latest(id) {
    const data = await chrome.runtime.sendMessage({ type: "activities" });
    post("activities", { id, data });
  }

  let subscription;
  let scheduled = false;
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== origin || typeof event.data?.id !== "string") return;
    const { type, url, id, list, status } = event.data;
    if (type === "seif-study-extension:subscribe") {
      subscription = id;
      void latest(id).catch(() => {});
    } else if (type === "seif-study-extension:status" && id === subscription) {
      void chrome.runtime.sendMessage({ type: "sync-status", url, status }).catch(() => {});
    } else if (type === "seif-study-extension:unsubscribe") {
      if (subscription === id) subscription = undefined;
      for (const [key, request] of requests) if (request.id === id) requests.delete(key);
    } else if (type === "seif-study-extension:request" && typeof url === "string" && url.length <= 2000) {
      const request = { url, id, list };
      requests.set(id + ":" + !!list, request);
      void read(request).catch(() => {});
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(changes).some(key => key.startsWith("lesson:")) || scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (subscription) void latest(subscription).catch(() => {});
      for (const request of requests.values()) if (!request.list) void read(request).catch(() => {});
    }, 80);
  });
})();
