const requests = new Map();
window.addEventListener("message", async event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.type !== "seif-study-extension:request") return;
  const { url, id, list } = event.data;
  if (typeof url !== "string" || url.length > 2000 || typeof id !== "string") return;
  requests.set(id, { url, id, list });
  try {
    const data = await chrome.runtime.sendMessage({ type: list ? "list" : "read", url });
    window.postMessage({ type: "seif-study-extension:progress", id, data, list }, location.origin);
  } catch { /* The extension may have been reloaded. */ }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !Object.keys(changes).some(key => key.startsWith("lesson:"))) return;
  for (const { url, id, list } of requests.values()) {
    try {
      const data = await chrome.runtime.sendMessage({ type: list ? "list" : "read", url });
      window.postMessage({ type: "seif-study-extension:progress", id, data, list }, location.origin);
    } catch {}
  }
});