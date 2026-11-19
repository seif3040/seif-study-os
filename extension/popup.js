import { lessonKey } from "./progress.js";

const byId = id => document.getElementById(id);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const key = lessonKey(tab?.url);
const site = "https://seif-study-os.vercel.app";
const status = byId("status");
const theme = byId("theme");
const preferences = await chrome.storage.local.get("theme");
theme.value = ["graphite", "violet", "light"].includes(preferences.theme) ? preferences.theme : "graphite";
document.documentElement.dataset.theme = theme.value;
theme.addEventListener("change", () => {
  document.documentElement.dataset.theme = theme.value;
  void chrome.storage.local.set({ theme: theme.value });
});
if (!key || new URL(key).origin === site) {
  status.textContent = "افتح صفحة درس على منصة المدرس واضغط على الإضافة.";
} else {
  initialize().catch(() => { status.textContent = "تعذّر فتح متابعة الدرس. جرّب تاني."; });
}

async function initialize() {
  const origin = new URL(key).origin;
  const pattern = origin + "/*";
  const scriptId = "seif-" + [...origin].map(char => char.charCodeAt(0).toString(16)).join("");
  const send = (type, data = {}) => chrome.runtime.sendMessage({ type, url: key, title: tab.title, ...data });
  const clock = value => {
    const seconds = Math.max(0, Math.floor(value));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return [hours, minutes, seconds % 60].map(part => String(part).padStart(2, "0")).join(":");
  };
  let resumeAt;
  let frameIds = [];
  let savedPlace;
  let supported = false;
  byId("lesson-title").textContent = tab.title || new URL(key).hostname;
  const states = {
    linked: "الجلسة متصلة",
    paused: "الجلسة متوقفة",
    break: "الجلسة في استراحة",
    conflict: "فيه درس تاني مفتوح للمادة",
    unknown: "المنصة مش مسجّلة في مصادر دروسك",
    choose: "اختار المادة في الموقع",
    error: "الربط متعطّل مؤقتًا",
  };

  async function probe() {
    for (const frameId of frameIds) {
      const player = await chrome.tabs.sendMessage(tab.id, { type: "player" }, { frameId }).catch(() => null);
      if (player?.available) return frameId;
    }
    const player = await chrome.tabs.sendMessage(tab.id, { type: "player" }).catch(() => null);
    return player?.available ? -1 : null;
  }

  async function offerFrames() {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Array.from(new Set([...document.querySelectorAll("iframe[src]")].flatMap(frame => {
        const bounds = frame.getBoundingClientRect();
        try {
          const url = new URL(frame.src);
          return bounds.width >= 240 && bounds.height >= 120 && url.protocol === "https:" && url.origin !== location.origin ? [url.origin] : [];
        } catch { return []; }
      }))),
    });
    byId("frame").replaceChildren(...result.map(frameOrigin => new Option(new URL(frameOrigin).hostname, frameOrigin)));
    byId("frames").hidden = supported || !result.length;
  }

  async function installForTab() {
    const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["tracker.js"] })
      .catch(() => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracker.js"] }));
    frameIds = frames.map(frame => frame.frameId);
    supported = (await probe()) !== null;
    await offerFrames().catch(() => {});
  }

  async function refresh() {
    const data = await send("read");
    if (!data || data.error) throw new Error("No lesson status");
    savedPlace = data.position;
    const sync = data.status;
    const recent = sync && (Date.now() - sync.at < 15000 || !data.playing);
    const state = recent ? states[sync.state] : undefined;
    byId("subject").textContent = sync?.subject || "المادة لسه ما اتحددتش";
    byId("connection").textContent = state || "في انتظار الموقع";
    byId("open-site").href = site + "/study-video" + (sync?.subjectKey ? "?subject=" + sync.subjectKey : "");
    const manual = data.manualSince && sync?.timer;
    const manualTime = manual ? manual.seconds + Math.max(0, Math.floor((Math.min(Date.now(), manual.deadline) - manual.startedAt) / 1000)) : data.manual;
    byId("clock-label").textContent = data.manualSince ? "وقت الجلسة اليدوي" : "موضع الفيديو";
    byId("position").textContent = data.manualSince ? clock(manualTime) : savedPlace === undefined ? "—" : clock(savedPlace);
    byId("playback").textContent = data.manualSince ? "المؤقت اليدوي شغّال"
      : data.lastAutoAt ? data.playing && Date.now() - data.lastAutoAt < 15000 ? "الفيديو شغّال" : "الفيديو متوقف"
      : "شغّل الفيديو أو ابدأ المؤقت اليدوي.";
    if (!state && (data.playing || data.manualSince)) status.textContent = "سيب Seif Study OS مفتوح في تابة تانية للمزامنة.";
    else if (status.textContent.startsWith("سيب Seif")) status.textContent = "";
    byId("manual").textContent = data.manualSince ? "أوقف المؤقت اليدوي" : "ابدأ مؤقت يدوي";
    byId("resume").disabled = !supported || (resumeAt ?? savedPlace) === undefined;
  }

  function listen(id, type, action) {
    byId(id).addEventListener(type, event => {
      event.preventDefault();
      Promise.resolve(action()).catch(() => { status.textContent = "العملية ما كملتش. جرّب تاني."; });
    });
  }

  resumeAt = (await send("read"))?.position;
  byId("controls").hidden = false;
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (granted) await installForTab().catch(() => {});
  status.textContent = supported ? "المتابعة شغّالة على الفيديو ده." : "لو المشغّل مقفول، استخدم المؤقت والحفظ اليدوي.";
  byId("enable").hidden = granted;
  listen("enable", "click", async () => {
    if (!await chrome.permissions.request({ origins: [pattern] })) return;
    if (!(await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] })).length) {
      await chrome.scripting.registerContentScripts([{ id: scriptId, matches: [pattern], js: ["tracker.js"], allFrames: true }]);
    }
    await installForTab();
    byId("enable").hidden = true;
    status.textContent = supported ? "المتابعة شغّالة على الفيديو ده." : "الصلاحية اتفعّلت. لو المشغّل ظاهر ومفيش متابعة، احفظ التوقيت يدويًا.";
    await refresh();
  });

  listen("enable-frame", "click", async () => {
    const frameOrigin = byId("frame").value;
    if (!frameOrigin) return;
    const framePattern = frameOrigin + "/*";
    if (!await chrome.permissions.request({ origins: [framePattern] })) return;
    const id = "seif-frame-" + [...frameOrigin].map(char => char.charCodeAt(0).toString(16)).join("");
    if (!(await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length) {
      await chrome.scripting.registerContentScripts([{ id, matches: [framePattern], js: ["tracker.js"], allFrames: true }]);
    }
    status.textContent = "اتفعّلت صلاحية المشغّل. حدّث صفحة الدرس وشغّل الفيديو وجرب تاني.";
  });

  listen("resume", "click", async () => {
    const frameId = await probe();
    if (frameId === null) { status.textContent = "شغّل الفيديو الأول أو ابدأه من التوقيت المحفوظ."; return; }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "seek", position: resumeAt ?? savedPlace },
      frameId === -1 ? {} : { frameId });
    if (!result?.sought) throw new Error("No player");
    resumeAt = undefined;
    status.textContent = "رجّعنا الفيديو لآخر مكان محفوظ.";
  });
  listen("manual", "click", async () => { await send("manual"); await refresh(); });
  listen("bookmark", "submit", async () => {
    const input = byId("time");
    const normalized = input.value.trim().replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    if (!/^\d{1,4}:[0-5]\d(?::[0-5]\d)?$/.test(normalized)) {
      status.textContent = "اكتب التوقيت زي 35:20 أو 1:10:05."; return;
    }
    const position = normalized.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    if (position > 604800) { status.textContent = "راجع التوقيت المكتوب."; return; }
    await send("bookmark", { position });
    resumeAt = position;
    input.value = "";
    await refresh();
  });
  listen("note", "submit", async () => {
    const field = byId("text");
    if (!field.value.trim()) return;
    await send("note", { text: field.value });
    field.value = "";
    status.textContent = "الملاحظة اتحفظت.";
  });
  await refresh();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes["lesson:" + key] || changes["sync:" + key])) void refresh().catch(() => {});
  });
  setInterval(async () => {
    try {
      if (granted || frameIds.length) supported = (await probe()) !== null;
      await refresh();
    } catch { /* The tab may already have switched lessons. */ }
  }, 1000);
}
