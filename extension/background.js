import { addWatchedRange, lessonKey } from "./progress.js";

const site = "https://seif-study-os.vercel.app";
const prefix = "lesson:";
const tasks = new Map();
const studyTabKey = id => "study-tab:" + id;
const closeAlarm = "seif-study-close";
const siteTabs = () => chrome.tabs.query({ url: site + "/*" });

async function configurePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    await chrome.action.setPopup({ popup: "popup.html" });
    return;
  }
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

void configurePanel().catch(() => chrome.action.setPopup({ popup: "popup.html" }).catch(() => {}));

async function closeStudySessions() {
  if ((await siteTabs()).length) return;
  const entries = await chrome.storage.local.get(null);
  await Promise.allSettled(Object.entries(entries).filter(([key, value]) =>
    key.startsWith("sync:") && value.endToken && value.sessionId && value.state !== "ended"
  ).map(([key]) => finish(key.slice(5), true)));
}

chrome.tabs.onRemoved.addListener(tabId => {
  const key = studyTabKey(tabId);
  void (async () => {
    if (!(await chrome.storage.session.get(key))[key]) return;
    await chrome.storage.session.remove(key);
    if ((await siteTabs()).length) return;
    await chrome.alarms.create(closeAlarm, { when: Date.now() + 30000 });
    await closeStudySessions();
  })().catch(() => {});
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === closeAlarm) void closeStudySessions().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(closeAlarm, { when: Date.now() + 30000 }).catch(() => {});
});

function finish(key, automatic = false) {
  return onLesson(key, async (data, id) => {
    if (automatic && (await siteTabs()).length) return null;
    const statusKey = "sync:" + key;
    const status = (await chrome.storage.local.get(statusKey))[statusKey];
    if (status?.state === "ended") return { ended: true };
    if (!status?.endToken) return { error: "الجلسة لسه ما اتربطتش بالموقع. افتحه مرة لحد ما تظهر الجلسة متصلة." };
    const now = Date.now();
    const position = !data.manualSince && data.lastAutoAt && Number.isFinite(data.position)
      ? Math.min(172800, data.position) : undefined;
    const response = await fetch(site + "/api/trpc/video.extensionEnd", {
      method: "POST", credentials: "omit", redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { token: status.endToken, position } }),
    });
    const result = await response.json();
    if (!response.ok || !result.result?.data?.json?.ended) {
      return { error: response.status === 401 ? "افتح الموقع مرة تانية عشان تجدّد الربط." : "إنهاء الجلسة ما اتسجّلش. جرّب تاني." };
    }
    if (data.manualSince) {
      data.manual += Math.max(0, Math.floor((now - data.manualSince) / 1000));
      delete data.manualSince;
    }
    data.endedAt = Date.now();
    data.playing = false;
    await chrome.storage.local.set({
      [id]: data,
      [statusKey]: { state: "ended", at: data.endedAt, subject: status.subject, subjectKey: status.subjectKey, sessionId: status.sessionId },
    });
    return { ended: true };
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.tabs.query({ url: site + "/*" }).then(tabs =>
    Promise.allSettled(tabs.map(tab =>
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["bridge.js"] })
    ))).catch(() => {});
});

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
  if (studySite && message.type === "activities") {
    if (Number.isInteger(sender.tab?.id)) {
      const key = studyTabKey(sender.tab.id);
      if (!(await chrome.storage.session.get(key))[key]) await chrome.storage.session.set({ [key]: true });
    }
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    return Object.entries(all)
      .filter(([id, value]) => id.startsWith(prefix) && !value.endedAt && (value.manualSince || now - (value.updatedAt ?? 0) < 60000))
      .map(([id, { title, detectedTitle, position, lastAutoAt, lastPlayingAt, playing, manualSince, manualChangedAt, updatedAt, restartedAt }]) =>
        ({ url: id.slice(prefix.length), title, detectedTitle, position, lastAutoAt, lastPlayingAt, playing, manualSince, manualChangedAt, updatedAt, restartedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  }
  const key = lessonKey(extensionPage || studySite ? message.url : sender.tab?.url || sender.url);
  if (!key) return null;
  if (extensionPage && message.type === "finish") return finish(key);
  if (studySite && message.type === "list") {
    const host = new URL(key).hostname.replace(/^www\./, "");
    const all = await chrome.storage.local.get(null);
    return Object.entries(all).filter(([id, value]) => id.startsWith(prefix)
      && (value.position !== undefined || value.watched > 0 || value.manual > 0 || value.manualSince || value.notes?.length))
      .flatMap(([id, value]) => {
        const url = id.slice(prefix.length);
        const normalized = lessonKey(url);
        if (!normalized) return [];
        const hostname = new URL(normalized).hostname.replace(/^www\./, "");
        if (hostname !== host && !hostname.endsWith("." + host)) return [];
        return [{ url: normalized, title: value.detectedTitle || value.title || new URL(normalized).pathname, position: value.position, lastPlayingAt: value.lastPlayingAt, playing: value.playing, lastAutoAt: value.lastAutoAt, manualSince: value.manualSince, updatedAt: value.updatedAt ?? value.lastAutoAt ?? value.manualSince ?? 0 }];
      }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  }
  if (studySite && message.type === "sync-status") {
    const status = message.status;
    if (!status || !["linked", "paused", "break", "conflict", "unknown", "choose", "error"].includes(status.state)
        || typeof status.subject !== "string" || status.subject.length > 80) return null;
    return onLesson(key, async data => {
      if (data.endedAt) return false;
      const statusKey = "sync:" + key;
      const previous = (await chrome.storage.local.get(statusKey))[statusKey];
      const sessionId = Number.isSafeInteger(status.sessionId) && status.sessionId > 0 ? status.sessionId : undefined;
      const endToken = sessionId && typeof status.endToken === "string" && status.endToken.length <= 1000 ? status.endToken : undefined;
      await chrome.storage.local.set({ [statusKey]: {
        state: status.state, subject: status.subject,
        subjectKey: /^[a-z_]{1,20}$/.test(status.subjectKey) ? status.subjectKey : "",
        timer: [status.timer?.seconds, status.timer?.startedAt, status.timer?.deadline].every(Number.isFinite) ? status.timer : undefined,
        at: Date.now(),
        sessionId,
        endToken: endToken ?? (sessionId && previous?.sessionId === sessionId ? previous.endToken : undefined),
      } });
      return true;
    });
  }
  if (studySite && message.type !== "read") return null;
  if (!extensionPage && !studySite) {
    if (!["sample", "metadata"].includes(message.type) || !sender.tab?.url) return null;
    const pattern = new URL(key).origin + "/*";
    if (!await chrome.permissions.contains({ origins: [pattern] })) return null;
  }
  return onLesson(key, async (data, id) => {
    const now = Date.now();
    if (message.type === "read") {
      const statusKey = "sync:" + key;
      const status = extensionPage ? (await chrome.storage.local.get(statusKey))[statusKey] : undefined;
      const { endToken, ...publicStatus } = status ?? {};
      return { ...data, status: status && publicStatus, canFinish: !!endToken, manual: data.manual + (data.manualSince ? Math.floor((now - data.manualSince) / 1000) : 0) };
    }
    if (message.type === "metadata") {
      if (sender.frameId !== 0 || typeof message.title !== "string") return null;
      const title = message.title.trim().slice(0, 220);
      if (!title || title === data.detectedTitle) return null;
      data.detectedTitle = title;
    } else if (message.type === "sample") {
      if (!Number.isFinite(message.position) || message.position < 0 || message.position > 604800) return null;
      if (data.endedAt && message.restarted !== true) return null;
      if (data.endedAt) {
        data.restartedAt = now;
        delete data.endedAt;
        await chrome.storage.local.remove("sync:" + key);
      }
      data.position = message.position;
      if (typeof sender.tab?.title === "string") data.title = sender.tab.title.trim().slice(0, 160);
      data.lastAutoAt = now;
      data.playing = message.playing === true;
      if (data.playing) data.lastPlayingAt = now;
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
      data.manualChangedAt = now;
      if (data.endedAt) {
        data.restartedAt = now;
        delete data.endedAt;
        await chrome.storage.local.remove("sync:" + key);
      }
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
