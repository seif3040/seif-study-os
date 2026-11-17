import { recordStudyMessage } from "@/components/StudyInbox";
import { toast } from "sonner";

const preferenceKey = "seif-study-alert-sound";
type AlertKind = "timer" | "completed";
let audio: AudioContext | undefined;
let messageOwner: number | undefined;
export function setStudyMessageOwner(owner?: number) { messageOwner = owner; }
let lastSound = 0;
const alerted = new Set<string>();
const alertHistoryKey = "seif-study-recent-alerts";

export function studySoundsEnabled() {
  try { return localStorage.getItem(preferenceKey) !== "off"; }
  catch { return true; }
}

export function setStudySounds(enabled: boolean) {
  try { localStorage.setItem(preferenceKey, enabled ? "on" : "off"); }
  catch { /* Playback still depends on browser settings. */ }
}

export async function prepareStudySound() {
  if (!studySoundsEnabled() || typeof AudioContext === "undefined") return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") await audio.resume();
  } catch { /* The visual alert is still available. */ }
}

export async function playStudySound(kind: AlertKind) {
  if (!studySoundsEnabled() || !audio) return false;
  try {
    if (audio.state !== "running") {
      if (kind === "timer") return false;
      void audio.resume().catch(() => undefined);
      return false;
    }
    if (Date.now() - lastSound < 500) return true;
    lastSound = Date.now();
    const context = audio;
    const notes = kind === "timer" ? [740, 988, 740, 988] : [523, 659, 784];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime + index * 0.16;
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.001, start);
      envelope.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
      oscillator.connect(envelope).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
    return true;
  } catch { return false; }
}

export function notifyStudy(message: string, kind: AlertKind, key?: string, path?: string) {
  if (key) {
    if (alerted.has(key)) return;
    try {
      const stored = JSON.parse(localStorage.getItem(alertHistoryKey) ?? "[]");
      const recent = Array.isArray(stored) ? stored.slice(-127) : [];
      if (recent.includes(key)) return;
      localStorage.setItem(alertHistoryKey, JSON.stringify([...recent, key]));
    } catch { /* Deduplicate in memory when storage is unavailable. */ }
    if (alerted.size >= 128) alerted.delete(alerted.values().next().value ?? "");
    alerted.add(key);
  }
  if (messageOwner !== undefined) recordStudyMessage(messageOwner, message, path ?? (kind === "timer" ? "/study-video" : "/today"));
  toast.success(message);
  void playStudySound(kind);
  if (document.hidden) void sendStudyDeviceMessage(message, key);
}

export async function sendStudyDeviceMessage(message: string, key?: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { if (localStorage.getItem("seif-study-reminders") !== "on") return; }
  catch { return; }
  const options = { body: message, icon: "/study-icon-192.png", tag: key ? "study-" + key : "study-completed", silent: true, data: { path: "/today" } };
  try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.active) await registration.showNotification("Seif Study OS", options);
      else new Notification("Seif Study OS", options);
  } catch { /* An in-app alert has already been displayed. */ }
}
