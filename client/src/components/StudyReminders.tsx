import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const preferenceKey = "seif-study-reminders";
const cairoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
});

function currentDay() {
  const parts = Object.fromEntries(cairoDay.formatToParts(new Date()).map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join("-");
}

export function StudyReminders({ ownerId }: { ownerId: number }) {
  const summary = trpc.dashboard.summary.useQuery();
  const reviews = trpc.studyPlan.reviews.useQuery();
  useEffect(() => {
    function check() {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        if (localStorage.getItem(preferenceKey) !== "on") return;
        const day = currentDay();
        const due = reviews.data?.filter(review => review.day <= day).length ?? 0;
        const exams = (summary.data?.upcomingExams ?? []).filter(exam => {
          if (!exam.scheduledAt) return false;
          const remaining = +new Date(exam.scheduledAt) - Date.now();
          return remaining > 0 && remaining <= 86_400_000;
        });
        const body = [due ? "مراجعات مستحقة: " + due : "", ...exams.map(exam => "امتحان قريب: " + exam.title)].filter(Boolean).join(" · ");
        const key = preferenceKey + ":" + ownerId + ":last";
        if (!body || localStorage.getItem(key) === day) return;
        localStorage.setItem(key, day);
        const options = { body, icon: "/study-icon-192.png", tag: "seif-study-" + day };
        void navigator.serviceWorker?.getRegistration().then(registration => {
          if (registration?.active) return registration.showNotification("Seif Study OS", options);
          new Notification("Seif Study OS", options);
        }).catch(() => {
          localStorage.removeItem(key);
          toast(body);
        });
      } catch { /* Browser storage may be unavailable. */ }
    }
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("study-reminders-changed", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("study-reminders-changed", check);
    };
  }, [ownerId, reviews.data, summary.data]);
  return null;
}

export function ReminderSettings() {
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
    <p className="text-sm text-muted-foreground">تنبيه على الجهاز بالمراجعات المستحقة والامتحانات خلال ٢٤ ساعة، طالما الموقع مفتوح.</p>
    <Button variant="outline" onClick={() => void toggle()}>{enabled ? "إيقاف التنبيهات" : "تشغيل التنبيهات"}</Button>
  </section>;
}
