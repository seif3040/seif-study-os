import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, money } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const labels: Record<string, string> = {
  studyCycles: "فترات الدراسة", subjects: "المواد", chapters: "الفصول", lessons: "الدروس",
  lessonProgress: "تقدم الدروس", tasks: "المهام", assistantChats: "المحادثات", assistantMessages: "رسائل جارفيس",
  dailyStudySummaries: "الملخصات اليومية", habits: "العادات", habitCompletions: "إنجازات العادات",
  goals: "الأهداف", goalMilestones: "خطوات الأهداف", pomodoroSessions: "جلسات البومودورو",
  studyVideoSessions: "جلسات الفيديو", videoNotes: "ملاحظات الفيديو", notebooks: "دفاتر الملاحظات",
  notes: "الملاحظات", notebookSources: "مصادر الدفاتر", exams: "الامتحانات", examLessons: "دروس الامتحانات",
  examAttempts: "محاولات الامتحانات", flashcardDecks: "مجموعات البطاقات", flashcards: "بطاقات المراجعة",
  calendarEvents: "مواعيد التقويم", lessonSources: "مصادر الدروس", rewardPurchases: "مشتريات الهدايا",
  userAchievements: "الإنجازات", coinTransactions: "سجل الكوينز", studyEvents: "سجل المذاكرة",
};

export default function StudyRestore() {
  const utils = trpc.useUtils();
  const restore = trpc.backup.restore.useMutation();
  const [raw, setRaw] = useState("");
  const [reading, setReading] = useState(false);
  const [plan, setPlan] = useState<{ name: string; missing: number; retained: number }[]>();
  const total = plan?.reduce((count, row) => count + row.missing, 0) ?? 0;
  const busy = reading || restore.isPending;

  async function preview(file: File) {
    setPlan(undefined); setRaw(""); setReading(true);
    try {
      if (file.size > 2_500_000) throw new Error("الملف أكبر من الحد المسموح للاسترجاع (٢٫٥ ميجابايت).");
      const content = await file.text();
      const result = await restore.mutateAsync({ raw: content, preview: true });
      setRaw(content);
      setPlan(result.summary);
    } catch (error) { toast.error(errorText(error)); }
    finally { setReading(false); }
  }

  async function confirm() {
    try {
      const result = await restore.mutateAsync({ raw, preview: false });
      setRaw(""); setPlan(undefined);
      toast.success("تم استرجاع " + money.format(result.restored) + " سجل.");
      await utils.invalidate();
    } catch (error) { toast.error(errorText(error)); }
  }

  return <div className="mt-5 space-y-3 border-t pt-5">
    <h3 className="font-bold">استرجاع نسخة احتياطية</h3>
    <p className="text-sm text-muted-foreground">اختار ملف JSON موقّع من نفس الحساب. الاسترجاع بيضيف السجلات الناقصة ويحتفظ بالموجودة.</p>
    <Input className="w-auto" type="file" accept="application/json,.json" aria-label="ملف الاسترجاع" disabled={busy} onChange={event => {
      const file = event.target.files?.[0];
      if (file) void preview(file);
      event.target.value = "";
    }} />
    {plan && <div className="space-y-3">
      <ul className="max-h-56 divide-y overflow-auto rounded-lg border">{plan.filter(row => row.missing || row.retained).map(row => <li key={row.name} className="flex flex-wrap justify-between gap-2 p-2 text-sm">
        <span>{labels[row.name] ?? row.name}</span><span className="text-muted-foreground">{money.format(row.missing)} هيرجعوا · {money.format(row.retained)} موجودين</span>
      </li>)}</ul>
      {total ? <Button disabled={busy} onClick={() => void confirm()}>استرجع {money.format(total)} سجل</Button> : <p className="text-sm">كل سجلات النسخة موجودة في حسابك.</p>}
    </div>}
  </div>;
}
