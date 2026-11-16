import { useState } from "react";
import { BellRing, BookOpen, MoonStar } from "lucide-react";
import { Link } from "wouter";
import { plannerToday, shiftPlannerDay } from "@shared/studyPlanner";
import { sleepDuration, sleepTargetMinutes } from "@shared/sleep";
import { examLocalDate } from "@shared/examSchedule";
import { minutesLabel, money } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";
import { Button } from "@/components/ui/button";
import SleepDialog from "@/components/SleepDialog";
import { trpc } from "@/lib/trpc";

export default function TodayNotices({ day }: { day: string }) {
  const planner = trpc.planner.list.useQuery();
  const analytics = trpc.analytics.overview.useQuery();
  const subjects = trpc.analytics.subjects.useQuery();
  const [edit, setEdit] = useState(false);
  const sleep = planner.data?.sleepLogs?.[day];
  const duration = sleep ? sleepDuration(sleep) : null;
  const minutesByDay = new Map((analytics.data?.daily ?? []).map(row => [String(row.day).slice(0, 10), Number(row.minutes)]));
  const late = examLocalDate(new Date()).slice(11) >= "18:00";
  const focusDay = late ? day : shiftPlannerDay(day, -1);
  const focus = analytics.data && (minutesByDay.get(focusDay) ?? 0);
  const focusSubject = subjects.data?.filter(item => item.id !== null && item.trackedMinutes >= 180 && item.attempts >= 2 && item.averageScore !== null && item.averageScore < 65)
    .sort((a, b) => (a.averageScore ?? 100) - (b.averageScore ?? 100))[0];
  const sleepNotice = duration !== null && duration < sleepTargetMinutes;
  const studyNotice = typeof focus === "number" && focus < 60;
  return <section className="surface space-y-3 p-4 sm:p-6">
    <h2 className="flex items-center gap-2 font-bold"><BellRing className="size-5 text-primary" />تنبيهات النهارده</h2>
    {sleepNotice && <article className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="font-bold">نومك أقل من هدفك</p>
      <p className="text-sm">سجّلت {minutesLabel(duration)}. خفّف خطة النهارده لو حاسس إن تركيزك أقل من المعتاد.</p>
    </article>}
    {studyNotice && <article className="rounded-xl border p-3">
      <p className="font-bold">وقت المذاكرة {late ? "النهارده" : "امبارح"} أقل من ساعة</p>
      <p className="text-sm">المسجّل {minutesLabel(focus)}. لو عندك وقت، ابدأ بجلسة قصيرة على أقرب درس أو واجب.</p>
    </article>}
    {focusSubject && <article className="rounded-xl border p-3">
      <p className="font-bold">ركّز على {focusSubject.title}</p>
      <p className="text-sm">سجّلت {minutesLabel(focusSubject.trackedMinutes)} مذاكرة للمادة، ومتوسط آخر سجل درجاتها {money.format(focusSubject.averageScore ?? 0)}٪ عبر {focusSubject.attempts} محاولة. ابدأ بالأسئلة اللي غلطت فيها.</p>
      <Link href="/mistakes" className="text-sm text-primary underline">افتح كشكول الأخطاء</Link>
    </article>}
    {sleep && duration !== null && duration >= sleepTargetMinutes && typeof focus === "number" && focus >= 60 && !focusSubject &&
      <p className="rounded-xl bg-primary/10 p-3 text-sm">وصلت لهدف النوم، وسجّلت {minutesLabel(focus)} مذاكرة {late ? "النهارده" : "امبارح"}.</p>}
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <MoonStar className="size-5 text-primary" aria-hidden />
      <div className="min-w-40 flex-1"><p className="font-semibold">نوم الليلة اللي فاتت</p>
        <p className="text-sm text-muted-foreground">{sleep ? formatClock(sleep.bed) + " ← " + formatClock(sleep.wake) + " · " + minutesLabel(duration ?? 0) : "لسه ما سجلتش نومك."}</p></div>
      <Button size="sm" variant="outline" disabled={day !== plannerToday()} onClick={() => setEdit(true)}>{sleep ? "عدّل النوم" : "سجّل النوم"}</Button>
    </div>
    {edit && <SleepDialog day={day} initial={sleep} onClose={() => setEdit(false)} />}
  </section>;
}

export function DailyQuran({ day }: { day: string }) {
  const verse = trpc.dashboard.dailyQuran.useQuery({ day }, { staleTime: Infinity });
  return <section className="surface space-y-3 rounded-3xl border-primary/25 bg-primary/5 p-5 sm:p-7">
    <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="size-5 text-primary" />آية اليوم</h2>
    {verse.data ? <>
      <blockquote lang="ar" className="text-2xl font-semibold leading-relaxed">﴿{verse.data.text}﴾</blockquote>
      <p className="text-sm text-muted-foreground">السورة {money.format(verse.data.surah)} · الآية {money.format(verse.data.ayah)}</p>
      <div className="rounded-xl border p-3"><h3 className="mb-1 font-semibold">التفسير الميسّر</h3><p className="text-sm leading-relaxed">{verse.data.explanation}</p>{verse.data.footnotes && <p className="mt-2 text-xs text-muted-foreground">{verse.data.footnotes}</p>}</div>
      {verse.data.reflection && <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
        <h3 className="mb-1 font-semibold text-primary">تأمل ليك النهارده</h3>
        <p className="text-sm leading-relaxed">{verse.data.reflection}</p>
      </div>}
      <a href={verse.data.source} target="_blank" rel="noreferrer" className="text-sm text-primary underline">المصدر · موسوعة القرآن الكريم</a>
      {verse.data.edition && <p className="text-xs text-muted-foreground">مجمع الملك فهد لطباعة المصحف الشريف · الإصدار {verse.data.edition}</p>}
    </> : verse.isError ? <p className="text-sm">تعذّر تحميل الآية. <Button size="sm" variant="ghost" onClick={() => void verse.refetch()}>جرّب تاني</Button></p> :
      <p className="text-sm text-muted-foreground">جارٍ تحميل آية اليوم…</p>}
  </section>;
}
