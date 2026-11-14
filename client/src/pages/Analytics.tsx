import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { money, minutesLabel } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Award, BarChart3, BookOpen, BrainCircuit, CheckSquare, CircleDollarSign, Timer, Video } from "lucide-react";
const cards = [{ key: "lessonsCompleted", label: "الدروس المكتملة", icon: BookOpen }, { key: "studyMinutes", label: "ساعات الدراسة", icon: Timer }, { key: "pomodoros", label: "Pomodoros", icon: Timer }, { key: "videoMinutes", label: "وقت الفيديو", icon: Video }, { key: "examsCompleted", label: "امتحانات مكتملة", icon: BrainCircuit }, { key: "tasksCompleted", label: "مهام مكتملة", icon: CheckSquare }, { key: "goalsCompleted", label: "أهداف مكتملة", icon: Award }, { key: "currentStreak", label: "السلسلة الحالية", icon: BarChart3 }] as const;
export default function Analytics() {
  return <div className="space-y-8"><Overview /><SubjectReport /></div>;
}

function SubjectReport() {
  const report = trpc.analytics.subjects.useQuery();
  const [selection, setSelection] = useState("all");
  const subjects = report.data ?? [];
  const visible = subjects.filter(subject => selection === "all" || String(subject.id) === selection);
  const format = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });
  const hours = (minutes: number) => format.format(Math.floor(minutes / 60)) + " س " + format.format(minutes % 60) + " د";
  const percent = (value: number | null) => value === null ? "—" : format.format(value) + "٪";
  return <section>
    <PageHeader title="تحليل كل مادة" description="وقت المذاكرة، التقدّم في الدروس، ونتائج الامتحانات لكل مادة." />
    <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold">المادة
        <select className="rounded-lg border bg-background px-3 py-2" value={selection} onChange={event => setSelection(event.target.value)}>
          <option value="all">كل المواد</option>
          {subjects.map(subject => <option key={subject.id ?? "none"} value={String(subject.id)}>{subject.title}</option>)}
        </select>
      </label>
      <a className="rounded-lg border px-3 py-2 text-sm font-bold hover:bg-muted" href="/api/analytics/subjects?format=csv">تنزيل CSV</a>
      <a className="rounded-lg px-3 py-2 text-sm font-bold text-primary hover:bg-muted" href="/api/analytics/subjects" target="_blank" rel="noreferrer">عرض API</a>
    </div>
    {report.isLoading && <p className="p-3 text-sm text-muted-foreground">جارٍ تحميل التحليلات…</p>}
    {report.isError && <button className="p-3 text-sm text-primary" onClick={() => void report.refetch()}>تعذّر التحميل. إعادة المحاولة</button>}
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {visible.map(subject => <article key={subject.id ?? "none"} className="surface study-interactive min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="size-4 text-primary" aria-hidden />{subject.title}</h2><p className="text-xs text-muted-foreground">{format.format(subject.activeDays)} يوم نشاط · {format.format(subject.focusSessions)} جلسة تركيز</p></div>
          <span className="rounded-lg bg-primary/10 px-2 py-1 text-sm font-bold text-primary">{hours(subject.minutes)}</span>
        </div>
        {subject.lessons > 0 && <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">{format.format(subject.completed)} من {format.format(subject.lessons)} درس مكتمل · {format.format(subject.chapters)} فصل</p>
          <progress className="h-2 w-full accent-primary" aria-label="الدروس المكتملة" value={subject.completed} max={subject.lessons} />
        </div>}
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">وقت منسوب مباشرة</dt><dd className="font-semibold">{hours(subject.trackedMinutes)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">وقت تاريخي موزّع</dt><dd className="font-semibold">{hours(subject.allocatedMinutes)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">محاولات الامتحانات</dt><dd className="font-semibold">{format.format(subject.attempts)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">متوسط النتيجة</dt><dd className="font-semibold">{percent(subject.averageScore)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">أفضل نتيجة</dt><dd className="font-semibold">{percent(subject.bestScore)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">متوسط الاستيعاب</dt><dd className="font-semibold">{percent(subject.averageComprehension)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">مراجعات الدروس</dt><dd className="font-semibold">{format.format(subject.reviews)}</dd></div>
        </dl>
        {!!subject.recentAttempts.length && <details className="mt-4 border-t pt-3">
          <summary className="cursor-pointer text-sm font-semibold">آخر محاولات الامتحانات</summary>
          <ul className="mt-2 divide-y">{subject.recentAttempts.map(attempt => <li key={attempt.id} className="flex justify-between gap-2 py-2 text-sm">
            <span>{attempt.exam}<small className="block text-muted-foreground">{attempt.date}</small></span><b>{percent(attempt.score)}</b>
          </li>)}</ul>
        </details>}
        {!!subject.missedTopics.length && <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-sm font-semibold">موضوعات الغلط المتكررة</summary>
          <ul className="mt-2 divide-y">{subject.missedTopics.map(item => <li key={item.topic} className="flex justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">{item.topic}<small className="block text-muted-foreground">{format.format(item.count)} محاولة</small></span><a className="shrink-0 text-sm font-semibold text-primary underline" href={"/calendar?review=" + encodeURIComponent(("مراجعة " + subject.title + " · " + item.topic).slice(0, 200))}>ضيف مهمة مراجعة</a>
          </li>)}</ul>
        </details>}
      </article>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">الساعات القديمة اللي اتسجلت من غير مواد اتوزّعت بالترتيب على مواد الخطة. الامتحانات المشتركة بين مواد بتظهر في «بدون مادة» عشان النتيجة ما تتحسبش مرتين.</p>
  </section>;
}

function Overview() {
  const { data, isLoading, isError, refetch } = trpc.analytics.overview.useQuery();
  const [limit, setLimit] = useState(14);
  if (isLoading) return <div className="h-80 animate-pulse rounded-2xl bg-muted" />;
  if (isError) return <button onClick={() => void refetch()}>تعذّر تحميل سجل تطوّرك. جرّب تاني.</button>;
  if (!data) return <EmptyState title="لسه مفيش نشاط" description="إنجازاتك هتظهر هنا أول ما تسجّل مذاكرة." />;
  const daily = [...data.daily].reverse();
  const max = Math.max(1, ...daily.slice(0, limit).map(day => Number(day.minutes)));
  return <section className="space-y-4">
    <PageHeader title="رحلة إنجازك" description="شوف وقت مذاكرتك واللي أنجزته في كل يوم نشاط." />
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map(({ key, label, icon: Icon }) => <article key={key} className="surface flex items-center gap-3 p-4">
        <Icon className="size-5 shrink-0 text-primary" /><div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{key === "studyMinutes" || key === "videoMinutes"
            ? minutesLabel(Number(data.metrics[key] ?? 0)) : money.format(Number(data.metrics[key] ?? 0))}</p>
        </div>
      </article>)}
    </div>
    <div className="surface space-y-3 p-4 sm:p-6">
      <h2 className="font-bold">إنجازات يوم بيوم</h2>
      {!daily.length && <p>أول يوم مذاكرة هيتسجل هنا.</p>}
      {daily.slice(0, limit).map(day => <article key={String(day.day)} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap justify-between gap-2">
          <time className="font-bold">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" }).format(new Date(String(day.day).slice(0, 10) + "T12:00:00"))}</time>
          <span className="font-bold text-primary">{minutesLabel(Number(day.minutes))}</span>
        </div>
        <progress className="h-2 w-full accent-primary" aria-label="وقت المذاكرة" value={Number(day.minutes)} max={max} />
        <p className="text-sm text-muted-foreground">{money.format(Number(day.lessons))} درس · {money.format(Number(day.tasks))} مهمة · {money.format(Number(day.exams))} امتحان · {money.format(Number(day.events))} نشاط</p>
      </article>)}
      {daily.length > limit && <button className="text-primary underline" onClick={() => setLimit(daily.length)}>اعرض كل الأيام</button>}
    </div>
  </section>;
}
