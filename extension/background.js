import { addWatchedRange, lessonKey } from "./progress.js";

const site = "https://seif-study-os.vercel.app";
const prefix = "lesson:";
const tasks = new Map();

function onLesson(key, action) {
  const pending = tasks.get(key) ?? Promise.resolve();
  const next = pending.catch(() => {}).then(async () => {
    const id = prefix + key;
    const data = (await chrome.storage.local.get(id))[id] ?? { ranges: [], watched: 0, manual: 0, notes: [] };
    return action(data, id);
  });
  tasks.set(key, next);
  const clean = () => { if (tasks.get(key) === next) tasks.delete(key); };
  next.then(clean, clean);
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(respond, () => respond({ error: "تعذّر حفظ بيانات الدرس." }));
  return true;
});

async function handle(message, sender) {
  if (!message || !sender.url) return null;
  const extensionPage = sender.url === chrome.runtime.getURL("popup.html");
  const studySite = new URL(sender.url).origin === site;
  const key = lessonKey(extensionPage || studySite ? message.url : sender.tab?.url || sender.url);
  if (!key) return null;
  if (studySite && message.type === "list") {
    const host = new URL(key).hostname;
    const all = await chrome.storage.local.get(null);
    return Object.entries(all).filter(([id, value]) => id.startsWith(prefix)
      && (value.position !== undefined || value.watched > 0 || value.manual > 0 || value.manualSince || value.notes?.length))
      .flatMap(([id, value]) => {
        const url = id.slice(prefix.length);
        const normalized = lessonKey(url);
        if (!normalized || new URL(normalized).hostname !== host) return [];
        return [{ url: normalized, title: value.title || new URL(normalized).pathname, position: value.position, updatedAt: value.updatedAt ?? value.lastAutoAt ?? value.manualSince ?? 0 }];
      }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  }
  if (studySite && message.type !== "read") return null;
  if (!extensionPage && !studySite) {
    if (message.type !== "sample" || !sender.tab?.url) return null;
    const pattern = new URL(key).origin + "/*";
    if (!await chrome.permissions.contains({ origins: [pattern] })) return null;
  }
  return onLesson(key, async (data, id) => {
    const now = Date.now();
    if (message.type === "read") return { ...data, manual: data.manual + (data.manualSince ? Math.floor((now - data.manualSince) / 1000) : 0) };
    if (message.type === "sample") {
      if (!Number.isFinite(message.position) || message.position < 0 || message.position > 604800) return null;
      data.position = message.position;
      data.lastAutoAt = now;
      if (Number.isFinite(message.from) && message.from >= 0 && message.position - message.from <= 30
          && Number.isFinite(message.seconds) && message.seconds > 0 && message.seconds <= 5 && !data.manualSince) {
        data.lastPlayingAt = now;
        data.ranges = addWatchedRange(data.ranges, message.from, message.position);
        if (!data.lastCountAt || now - data.lastCountAt >= message.seconds * 700) {
          data.watched += message.seconds;
          data.lastCountAt = now;
        }
      }
    } else if (message.type === "manual") {
      if (data.manualSince) {
        data.manual += Math.floor((now - data.manualSince) / 1000);
        delete data.manualSince;
      } else {
        data.manualSince = now;
      }
    } else if (message.type === "bookmark") {
      if (!Number.isFinite(message.position) || message.position < 0 || message.position > 604800) return null;
      data.position = message.position;
    } else if (message.type === "note") {
      const text = typeof message.text === "string" ? message.text.trim().slice(0, 1000) : "";
      if (!text) return null;
      data.notes.push({ text, position: data.position ?? null, at: now });
    } else {
      return null;
    }
    if (extensionPage && typeof message.title === "string" && message.title.trim()) data.title = message.title.trim().slice(0, 160);
    data.updatedAt = now;
    await chrome.storage.local.set({ [id]: data });
    return data;
  });
}
