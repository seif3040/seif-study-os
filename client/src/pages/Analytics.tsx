import SleepReport from "@/components/SleepReport";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { plannerToday, shiftPlannerDay } from "@shared/studyPlanner";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money, minutesLabel, studyDurationLabel, errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Award, BarChart3, BookOpen, BrainCircuit, CheckSquare, CircleDollarSign, Timer } from "lucide-react";
const scoreFormat = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? "—" : scoreFormat.format(value) + "٪";
const cards = [{ key: "lessonsCompleted", label: "الدروس المكتملة", icon: BookOpen }, { key: "studyMinutes", label: "ساعات الدراسة", icon: Timer }, { key: "pomodoros", label: "Pomodoros", icon: Timer }, { key: "averageExamScore", label: "متوسط درجات الامتحانات", icon: BrainCircuit }, { key: "tasksCompleted", label: "مهام مكتملة", icon: CheckSquare }, { key: "goalsCompleted", label: "أهداف مكتملة", icon: Award }, { key: "currentStreak", label: "السلسلة الحالية", icon: BarChart3 }] as const;
export default function Analytics() {
  return <div className="study-analytics space-y-8"><Overview /><SubjectReport /></div>;
}

function SubjectReport() {
  const report = trpc.analytics.subjects.useQuery();
  const [selection, setSelection] = useState("all");
  const [showUnassigned, setShowUnassigned] = useState(() => localStorage.getItem("seif-show-unassigned-analytics") === "true");
  const subjects = (report.data ?? []).filter(subject => showUnassigned || subject.id !== null);
  const visible = subjects.filter(subject => selection === "all" || String(subject.id) === selection);
  const hours = (minutes: number) => scoreFormat.format(Math.floor(minutes / 60)) + " س " + scoreFormat.format(minutes % 60) + " د";
  return <section>
    <PageHeader title="تحليل كل مادة" description="وقت المذاكرة، التقدّم في الدروس، ونتائج الامتحانات لكل مادة." />
    <div className="surface mb-4 flex flex-wrap items-center gap-3 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold">المادة
        <select className="rounded-lg border bg-background px-3 py-2" value={selection} onChange={event => setSelection(event.target.value)}>
          <option value="all">كل المواد</option>
          {subjects.map(subject => <option key={subject.id ?? "none"} value={String(subject.id)}>{subject.title}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showUnassigned} onChange={event => {
          const checked = event.target.checked;
          setShowUnassigned(checked);
          if (!checked && selection === "null") setSelection("all");
          localStorage.setItem("seif-show-unassigned-analytics", String(checked));
        }} /> أظهر بدون مادة
      </label>
      <a className="rounded-lg border px-3 py-2 text-sm font-bold hover:bg-muted" href="/api/analytics/subjects?format=csv">تنزيل CSV</a>
      <a className="rounded-lg px-3 py-2 text-sm font-bold text-primary hover:bg-muted" href="/api/analytics/subjects" target="_blank" rel="noreferrer">عرض API</a>
    </div>
    {report.isLoading && <p className="p-3 text-sm text-muted-foreground">جارٍ تحميل التحليلات…</p>}
    {report.isError && <button className="p-3 text-sm text-primary" onClick={() => void report.refetch()}>تعذّر التحميل. إعادة المحاولة</button>}
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {visible.map(subject => <article key={subject.id ?? "none"} className="surface study-interactive min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><BookOpen className="size-4 text-primary" aria-hidden />{subject.title}</h2><p className="text-xs text-muted-foreground">{scoreFormat.format(subject.activeDays)} يوم نشاط · {scoreFormat.format(subject.focusSessions)} جلسة تركيز</p></div>
          <span className="rounded-lg bg-primary/10 px-2 py-1 text-sm font-bold text-primary">{hours(subject.minutes)}</span>
        </div>
        {subject.lessons > 0 && <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">{scoreFormat.format(subject.completed)} من {scoreFormat.format(subject.lessons)} درس مكتمل · {scoreFormat.format(subject.chapters)} فصل</p>
          <progress className="h-2 w-full accent-primary" aria-label="الدروس المكتملة" value={subject.completed} max={subject.lessons} />
        </div>}
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">وقت منسوب مباشرة</dt><dd className="font-semibold">{hours(subject.trackedMinutes)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">وقت تاريخي موزّع</dt><dd className="font-semibold">{hours(subject.allocatedMinutes)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">محاولات الامتحانات</dt><dd className="font-semibold">{scoreFormat.format(subject.attempts)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">متوسط النتيجة</dt><dd className="font-semibold">{percent(subject.averageScore)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">أفضل نتيجة</dt><dd className="font-semibold">{percent(subject.bestScore)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">متوسط الاستيعاب</dt><dd className="font-semibold">{percent(subject.averageComprehension)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">مراجعات الدروس</dt><dd className="font-semibold">{scoreFormat.format(subject.reviews)}</dd></div>
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
            <span className="min-w-0 flex-1">{item.topic}<small className="block text-muted-foreground">{scoreFormat.format(item.count)} محاولة</small></span><a className="shrink-0 text-sm font-semibold text-primary underline" href={"/calendar?review=" + encodeURIComponent(("مراجعة " + subject.title + " · " + item.topic).slice(0, 200))}>ضيف مهمة مراجعة</a>
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
          <p className="text-lg font-bold">{key === "studyMinutes"
            ? studyDurationLabel(Number(data.metrics[key] ?? 0)) : key === "averageExamScore"
              ? data.comprehension.length ? percent(Number(data.metrics.averageExamScore)) : "—"
              : money.format(Number(data.metrics[key] ?? 0))}</p>
        </div>
      </article>)}
    </div>
    <AchievementTrend daily={data.daily} attempts={data.comprehension} examSubjects={data.examSubjects ?? []} />
    <SleepReport logs={data.sleepLogs ?? {}} daily={data.daily} breakMilliseconds={data.breakMilliseconds ?? {}} />
    <div className="surface space-y-3 p-4 sm:p-6">
      <h2 className="font-bold">إنجازات يوم بيوم</h2>
      {!daily.length && <p>أول يوم مذاكرة هيتسجل هنا.</p>}
      {daily.slice(0, limit).map(day => <article key={String(day.day)} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap justify-between gap-2">
          <time className="font-bold">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" }).format(new Date(String(day.day).slice(0, 10) + "T12:00:00"))}</time>
          <span className="font-bold text-primary">{studyDurationLabel(Number(day.minutes))}</span>
        </div>
        <progress className="h-2 w-full accent-primary" aria-label="وقت المذاكرة" value={Number(day.minutes)} max={max} />
        <DailyStudySessions sessions={day.sessions ?? []} overlap={day.overlapMinutes ?? 0} total={Number(day.minutes)} />
        <p className="text-sm text-muted-foreground">{money.format(Number(day.lessons))} درس · {money.format(Number(day.tasks))} مهمة · {money.format(Number(day.events))} نشاط</p>
      </article>)}
      {daily.length > limit && <button className="text-primary underline" onClick={() => setLimit(daily.length)}>اعرض كل الأيام</button>}
    </div>
  </section>;
}

function DailyStudySessions({ sessions, overlap, total }: {
  sessions: { id: number; at: Date; kind: string; minutes: number }[];
  overlap: number;
  total: number;
}) {
  const utils = trpc.useUtils();
  const correction = trpc.pomodoro.correctMinutes.useMutation({
    onSuccess: async () => { await utils.invalidate(); toast.success("مدة الجلسة اتعدّلت."); },
    onError: error => toast.error(errorText(error)),
  });
  const clock = new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });
  if (!sessions.length) return null;
  return <details className="text-sm">
    <summary className="cursor-pointer font-semibold text-primary">تفاصيل ساعات المذاكرة</summary>
    <div className="mt-3 space-y-2">
      <p>الإجمالي {money.format(Math.round(total))} دقيقة · التداخل المخصوم {money.format(Math.round(overlap))} دقيقة</p>
      {sessions.map(session => <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <span>{session.kind === "video_block" ? "فيديو مذاكرة" : session.kind === "pomodoro_complete" || session.kind === "pomodoro_running" ? "بومودورو" : "مذاكرة"} · {clock.format(new Date(session.at))} · {studyDurationLabel(session.minutes)}</span>
        {session.kind === "pomodoro_complete" && <form key={session.minutes} className="flex items-center gap-2" onSubmit={event => {
          event.preventDefault();
          const minutes = Number(new FormData(event.currentTarget).get("minutes"));
          correction.mutate({ eventId: session.id, minutes });
        }}>
          <input name="minutes" type="number" min={1} max={720} required defaultValue={Math.max(1, Math.round(session.minutes))} aria-label="مدة جلسة البومودورو بالدقائق" className="w-20 rounded-md border bg-background p-1" />
          <Button size="sm" variant="outline" disabled={correction.isPending}>عدّل</Button>
        </form>}
      </div>)}
    </div>
  </details>;
}

const trendMetrics = [
  ["minutes", "وقت المذاكرة"], ["lessons", "الدروس"], ["tasks", "المهام"], ["exams", "أداء الامتحانات"],
] as const;
type TrendMetric = typeof trendMetrics[number][0];
type DailyTrend = { day: string; minutes: number; lessons: number; tasks: number; exams: number };

function AchievementTrend({ daily, attempts, examSubjects }: {
  daily: DailyTrend[];
  attempts: { date: string | null; score: number; subjectId?: number | null }[];
  examSubjects: { id: number; title: string }[];
}) {
  const [examSubject, setExamSubject] = useState("all");
  const [metric, setMetric] = useState<TrendMetric>("minutes");
  const [range, setRange] = useState(14);
  const today = plannerToday();
  const days = new Map(daily.map(row => [String(row.day).slice(0, 10), row]));
  const examsByDay = new Map<string, number[]>();
  for (const attempt of attempts) {
    if (!attempt.date || (examSubject !== "all" && String(attempt.subjectId) !== examSubject)) continue;
    const scores = examsByDay.get(attempt.date) ?? [];
    scores.push(attempt.score);
    examsByDay.set(attempt.date, scores);
  }
  const mean = (scores: number[]) => scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const value = (day: string, key: Exclude<TrendMetric, "exams">) => Number(days.get(day)?.[key] ?? 0);
  const label = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" });
  const chart = Array.from({ length: range }, (_, index) => {
    const day = shiftPlannerDay(today, index - range + 1);
    return { day, label: label.format(new Date(day)), value: metric === "exams" ? mean(examsByDay.get(day) ?? []) : value(day, metric) };
  });
  const total = (key: TrendMetric, offset: number) => {
    const window = Array.from({ length: 7 }, (_, i) => shiftPlannerDay(today, offset - i));
    if (key === "exams") return mean(window.flatMap(day => examsByDay.get(day) ?? []));
    return window.reduce((sum, day) => sum + value(day, key), 0);
  };
  const format = (key: TrendMetric, amount: number | null) =>
    amount === null ? "—" : key === "minutes" ? minutesLabel(amount) : key === "exams" ? percent(amount) : money.format(amount);
  const hasChartData = metric !== "exams" || chart.some(point => point.value !== null);
  return <section className="surface space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">مستوى إنجازك</h2>
      <label className="text-sm">الفترة <select className="rounded-md border bg-background p-1.5" value={range}
        onChange={event => setRange(Number(event.target.value))}>
        <option value={14}>آخر ١٤ يوم</option><option value={30}>آخر ٣٠ يوم</option><option value={90}>آخر ٩٠ يوم</option>
      </select></label>
    </div>
    <p className="text-sm text-muted-foreground">{metric === "exams" ? "كل نقطة هي متوسط درجات محاولات اليوم بتاريخ أداء الامتحان. المقارنة بتعرض متوسط آخر أسبوعين، كل أسبوع لوحده." : "المقارنة بين آخر ٧ أيام مكتملة والـ٧ اللي قبلهم. الرسم بيشمل النهارده."}</p>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {trendMetrics.map(([key, name]) => {
        const current = total(key, -1), before = total(key, -8);
        const difference = current !== null && before !== null ? current - before : null;
        const changeLabel = (change: number) => key === "exams" ? money.format(change) + " نقطة مئوية" : format(key, change);
        return <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}
          className={"space-y-1 rounded-xl border p-3 text-start " + (metric === key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
          <span className="block font-semibold">{name}</span>
          <span className="block text-sm">{format(key, before)} ← {format(key, current)}</span>
          <span className="block text-xs font-semibold">{difference === null ? "بيانات المقارنة لسه ناقصة" : difference > 0 ? "↑ زاد " + changeLabel(difference) : difference < 0
            ? "↓ قلّ " + changeLabel(-difference) : "↔ ثابت"}</span>
        </button>;
      })}
    </div>
    {metric === "exams" && <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
      عرض أداء الامتحانات
      <select className="rounded-md border bg-background p-2" value={examSubject} onChange={event => setExamSubject(event.target.value)}>
        <option value="all">كل المواد · الأداء المجمّع</option>
        {examSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
      </select>
    </label>}
    {hasChartData ? <div dir="ltr" className="study-analytics-chart h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart} margin={{ top: 12, right: 16, bottom: 6, left: 0 }}>
          <CartesianGrid stroke="var(--muted-foreground)" opacity={0.22} vertical={false} />
          <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis width={46} allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            domain={metric === "exams" ? [0, 100] : undefined} tickFormatter={value => money.format(Number(value))}
            unit={metric === "minutes" ? " د" : metric === "exams" ? "٪" : undefined} />
          <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }} content={({ active, payload }) => {
            const point = payload?.[0]?.payload;
            if (!active || !point) return null;
            return <div dir="rtl" className="rounded-lg border bg-popover p-2 text-sm text-popover-foreground shadow-lg">
              <p>{point.label}</p><strong>{format(metric, point.value)}</strong>
            </div>;
          }} />
          <Line type="linear" dataKey="value" stroke="var(--chart-1)" strokeWidth={3}
            connectNulls={metric === "exams"} dot={range === 14 || metric === "exams"} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div> : <p className="rounded-xl border p-4 text-sm text-muted-foreground">مفيش نتائج لها تاريخ أداء في الفترة دي.</p>}
  </section>;
}
