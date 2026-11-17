import { useEffect, useState } from "react";
import { recordStudyMessage } from "@/components/StudyInbox";
import { morningStudyMessage } from "@/lib/studyBrief";
import { plannerToday } from "@shared/studyPlanner";
import { playStudySound, sendStudyDeviceMessage, prepareStudySound, setStudySounds, studySoundsEnabled } from "@/lib/studyAlerts";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const preferenceKey = "seif-study-reminders";
const cairoHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" });

export function StudyReminders({ ownerId }: { ownerId: number }) {
  const utils = trpc.useUtils();
  useEffect(() => {
    const key = preferenceKey + ":morning:" + ownerId;
    let sent: string | undefined;
    let checking = false;
    let disposed = false;

    async function check() {
      const day = plannerToday();
      if (checking || sent === day || Number(cairoHour.format(new Date())) < 7) return;
      try { if (localStorage.getItem(key) === day) return; }
      catch { /* Keep the current tab deduplicated. */ }

      checking = true;
      try {
        const brief = await utils.client.dashboard.dayBrief.query();
        if (disposed || brief.day !== day) return;
        try {
          if (localStorage.getItem(key) === day) return;
          localStorage.setItem(key, day);
        } catch { /* Keep the current tab deduplicated. */ }
        sent = day;
        const message = morningStudyMessage(brief, brief.friday);
        recordStudyMessage(ownerId, message);
        toast(message, { duration: 12_000 });
        void sendStudyDeviceMessage(message, "morning-" + day);
      } catch { /* Retry on the next check or when the connection returns. */ }
      finally { checking = false; }
    }
    void check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [ownerId, utils]);
  return null;
}

export function ReminderSettings() {
  const [sound, setSound] = useState(studySoundsEnabled);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preferenceKey) === "on"; } catch { return false; }
  });

  async function toggle() {
    try {
      if (!enabled) {
        if (!("Notification" in window) || await Notification.requestPermission() !== "granted") {
          toast.error("المتصفح مش سامح بالإشعارات. فعّلها من إعدادات الموقع.");
          return;
        }
      }
      localStorage.setItem(preferenceKey, enabled ? "off" : "on");
      setEnabled(!enabled);
      window.dispatchEvent(new Event("study-reminders-changed"));
    } catch { toast.error("تعذّر حفظ إعداد التنبيهات."); }
  }

  return <section className="surface space-y-3 p-5">
    <h2 className="flex items-center gap-2 font-bold"><Bell className="size-4" />تنبيهات المذاكرة</h2>
    <p className="text-sm text-muted-foreground">ملخص يومك من ٧ صباحًا بتوقيت القاهرة، ورسائل بعد الإنجاز طالما الموقع مفتوح. فعّل إشعارات الجهاز عشان توصلك حتى لو الموقع في الخلفية.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void toggle()}>{enabled ? "إيقاف إشعارات الجهاز" : "تشغيل إشعارات الجهاز"}</Button>
      <Button variant={sound ? "secondary" : "outline"} aria-pressed={sound} onClick={() => {
        const next = !sound;
        setStudySounds(next);
        setSound(next);
        if (next) prepareStudySound();
      }}>صوت الإكمال {sound ? "شغّال" : "مكتوم"}</Button>
      <Button variant="ghost" disabled={!sound} onClick={() => { void prepareStudySound().then(() => playStudySound("timer")); }}>جرّب الصوت</Button>
    </div>
    <p className="text-sm text-muted-foreground">صوت عند انتهاء التركيز والاستراحات والفيديو، ونغمة قصيرة لما تسجّل إنجاز.</p>
  </section>;
}
