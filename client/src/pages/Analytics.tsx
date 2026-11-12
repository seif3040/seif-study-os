import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { money, minutesLabel } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Award, BarChart3, BookOpen, BrainCircuit, CheckSquare, CircleDollarSign, Timer, Video } from "lucide-react";
const cards = [{ key: "lessonsCompleted", label: "الدروس المكتملة", icon: BookOpen }, { key: "studyMinutes", label: "ساعات الدراسة", icon: Timer }, { key: "pomodoros", label: "Pomodoros", icon: Timer }, { key: "videoMinutes", label: "وقت الفيديو", icon: Video }, { key: "examsCompleted", label: "امتحانات مكتملة", icon: BrainCircuit }, { key: "tasksCompleted", label: "مهام مكتملة", icon: CheckSquare }, { key: "goalsCompleted", label: "أهداف مكتملة", icon: Award }, { key: "currentStreak", label: "السلسلة الحالية", icon: BarChart3 }] as const;
export default function Analytics() {
  return <div className="space-y-8"><SubjectReport /><Overview /></div>;
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
      {visible.map(subject => <article key={subject.id ?? "none"} className="surface min-w-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="text-lg font-bold">{subject.title}</h2><p className="text-xs text-muted-foreground">{format.format(subject.activeDays)} يوم نشاط · {format.format(subject.focusSessions)} جلسة تركيز</p></div>
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

function Overview() { const { data, isLoading } = trpc.analytics.overview.useQuery(); if (isLoading) return <div className="h-80 animate-pulse rounded-2xl bg-muted" />; if (!data) return <EmptyState title="لا توجد بيانات بعد" description="ستظهر التحليلات تلقائيًا عند تسجيل نشاط دراسي حقيقي." />; const daily = data.daily.map((x: any) => ({ ...x, label: new Date(`${x.day}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) })); const comprehension = data.comprehension.map((x: any) => ({ ...x, label: new Date(`${x.date}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) })); return <div><PageHeader title="نظرة عامة" description="كل بطاقة وكل رسم يعتمدان على نشاطك ومعاملاتك المسجلة، بلا أرقام افتراضية." /><div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ key, label, icon: Icon }) => <div key={key} className="surface flex items-center gap-3 p-4"><span className="metric-icon bg-primary/10 text-primary"><Icon className="size-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{key === "studyMinutes" || key === "videoMinutes" ? minutesLabel(data.metrics[key]) : money.format(data.metrics[key])}</p></div></div>)}</div><div className="mb-5 grid gap-4 xl:grid-cols-2"><ChartCard title="وقت الدراسة اليومي" subtitle="دقائق النشاط المسجل"><ResponsiveContainer width="100%" height={260}><BarChart data={daily}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="minutes" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard><ChartCard title="منحنى الاستيعاب" subtitle="بعد كل محاولة امتحان"><ResponsiveContainer width="100%" height={260}><LineChart data={comprehension}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Line dataKey="comprehension" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></ChartCard></div><div className="grid gap-4 xl:grid-cols-[1fr_.55fr]"><ChartCard title="الدراسة حسب المادة" subtitle="وقت التركيز المرتبط بالمواد">{data.bySubject.length ? <div className="space-y-4 pt-4">{data.bySubject.map((x: any) => <div key={x.subject ?? "none"} className="flex items-center justify-between rounded-xl bg-muted/55 p-3 text-sm"><span>{x.subject ?? "بدون مادة"}</span><b className="font-[Manrope] text-primary">{minutesLabel(Number(x.minutes))}</b></div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">اربط Pomodoro أو الدروس بمادة لتظهر هذه المقارنة.</p>}</ChartCard><div className="surface p-5"><div className="flex items-center gap-2"><CircleDollarSign className="size-5 text-primary" /><h2 className="font-bold">سجل المكافآت</h2></div><div className="mt-6 space-y-5"><Metric label="Coins مكتسبة" value={money.format(data.coins.earned)} /><Metric label="Coins منفقَة" value={money.format(data.coins.spent)} /><Metric label="المكافآت المشتراة" value={money.format(data.rewardsPurchased)} /><Metric label="متوسط الاستيعاب" value={`${money.format(Math.round(data.metrics.averageExamScore))}%`} /></div></div></div></div>; }
function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="surface p-5"><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p><div className="mt-3">{children}</div></section>; } function Metric({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b pb-3 text-sm last:border-0"><span className="text-muted-foreground">{label}</span><b className="font-[Manrope]">{value}</b></div>; }
