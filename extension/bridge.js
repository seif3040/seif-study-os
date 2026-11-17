window.addEventListener("message", async event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.type !== "seif-study-extension:request") return;
  const { url, id } = event.data;
  if (typeof url !== "string" || url.length > 2000 || typeof id !== "string") return;
  try {
    const data = await chrome.runtime.sendMessage({ type: "read", url });
    window.postMessage({ type: "seif-study-extension:progress", id, data }, location.origin);
  } catch { /* The extension may have been reloaded. */ }
});
