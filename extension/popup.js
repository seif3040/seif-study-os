import { lessonKey } from "./progress.js";

const byId = id => document.getElementById(id);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const key = lessonKey(tab?.url);
const site = "https://seif-study-os.vercel.app";
const status = byId("status");
if (!key || new URL(key).origin === site) {
  status.textContent = "افتح صفحة درس على منصة المدرس واضغط على الإضافة.";
} else {
  initialize().catch(() => { status.textContent = "تعذّر فتح متابعة الدرس. جرّب تاني."; });
}

async function initialize() {
  const origin = new URL(key).origin;
  const pattern = origin + "/*";
  const scriptId = "seif-" + [...origin].map(char => char.charCodeAt(0).toString(16)).join("");
  const send = (type, data = {}) => chrome.runtime.sendMessage({ type, url: key, ...data });
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

  async function probe() {
    for (const frameId of frameIds) {
      const player = await chrome.tabs.sendMessage(tab.id, { type: "player" }, { frameId }).catch(() => null);
      if (player?.available) return frameId;
    }
    return null;
  }

  async function installForTab() {
    const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["tracker.js"] })
      .catch(() => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracker.js"] }));
    frameIds = frames.map(frame => frame.frameId);
    supported = (await probe()) !== null;
  }

  async function refresh() {
    const data = await send("read");
    if (!data || data.error) throw new Error("No lesson status");
    savedPlace = data.position;
    byId("position").textContent = savedPlace === undefined ? "—" : clock(savedPlace);
    byId("watched").textContent = "المشاهدة " + clock(data.watched) + " · المؤقت اليدوي " + clock(data.manual);
    byId("ranges").textContent = data.ranges.slice(-8).map(([from, to]) => clock(from) + "–" + clock(to)).join("، ");
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

  listen("resume", "click", async () => {
    const frameId = await probe();
    if (frameId === null) { status.textContent = "شغّل الفيديو الأول أو ابدأه من التوقيت المحفوظ."; return; }
    await chrome.tabs.sendMessage(tab.id, { type: "seek", position: resumeAt ?? savedPlace }, { frameId });
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
  setInterval(async () => {
    try {
      if (granted || frameIds.length) supported = (await probe()) !== null;
      await refresh();
    } catch { /* The tab may already have switched lessons. */ }
  }, 2000);
}
