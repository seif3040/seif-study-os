import { TaskDialog, type CalendarTask } from "./Tasks";
import { useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, Check, CircleDollarSign, Clock3, Flame, GraduationCap, Sparkles, Timer } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/PageHeader";
import { errorText, minutesLabel, money } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const cairoDate = new Intl.DateTimeFormat("ar-EG", {
  weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo",
});

export default function Dashboard() {
  const homeworkQuery = trpc.tasks.list.useQuery();
  const [editingHomework, setEditingHomework] = useState<CalendarTask>();
  const summary = trpc.dashboard.summary.useQuery();
  const reviews = trpc.studyPlan.reviews.useQuery();
  const utils = trpc.useUtils();
  const review = trpc.studyPlan.review.useMutation({
    onSuccess: async () => { await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  const complete = trpc.tasks.complete.useMutation({
    onSuccess: async () => { await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  if (summary.isLoading) return <div className="space-y-4" aria-label="جارٍ تحميل اليوم"><div className="h-60 animate-pulse rounded-3xl bg-muted" /><div className="h-48 animate-pulse rounded-3xl bg-muted" /></div>;
  if (!summary.data) return <EmptyState title="تعذّر تحميل اليوم" description="جرّب تفتح الصفحة تاني." />;

  const { metrics, coins, todaysTasks, upcomingExams, ongoingPomodoro } = summary.data;
  const finished = todaysTasks.filter(task => task.status === "completed").length;
  const nextExam = upcomingExams[0];
  const progress = todaysTasks.length ? Math.round(finished * 100 / todaysTasks.length) : 0;
  const dayParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = [dayParts.year, dayParts.month, dayParts.day].join("-");
  const homework = (homeworkQuery.data ?? []).filter(task => task.category === "واجب" && task.status === "open")
    .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.id - b.id);
  const due = reviews.data?.filter(item => item.day <= today) ?? [];

  return <div className="space-y-5">
    <section className="study-hero today-hero rounded-[2rem] p-6 sm:p-9">
      <div className="today-hero-copy">
      <p className="flex items-center gap-2 text-sm text-white/85"><CalendarDays className="size-4" />{cairoDate.format(new Date())}</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">النهارده</h1>
      
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild className="study-hero-action study-interactive"><Link href="/pomodoro"><Timer />{ongoingPomodoro ? "كمّل جلسة التركيز" : "ابدأ بومودورو"}</Link></Button>
        <Button asChild variant="outline" className="study-interactive border-white/50 bg-transparent text-white hover:bg-white/15 hover:text-white"><Link href="/seify"><Sparkles />كلم جارفيس</Link></Button>
      </div>
      </div>
      <div className="today-progress">
        <div className="today-progress-ring" style={{ "--study-progress": progress + "%" } as CSSProperties} aria-hidden>
          <span>{money.format(progress)}٪</span>
        </div>
        <div>
          <h2 className="text-sm font-bold">إنجاز اليوم</h2>
          <p className="mt-1 text-xs text-white/85">{money.format(finished)} من {money.format(todaysTasks.length)} مهام خلصت</p>
        </div>
      </div>
    </section>
    <section className="surface space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><BookOpen className="size-5" /> الواجبات القادمة</h2>
        <Link href="/lesson-sources" className="text-sm text-primary underline">جدول الحصص</Link>
      </div>
      {homeworkQuery.isLoading ? <p>جارٍ تحميل الواجبات…</p> : homeworkQuery.isError ? <p role="alert">تعذّر تحميل الواجبات.</p> : homework.length ? <ul className="divide-y">
        {homework.map(task => <li key={task.id} className="flex flex-wrap items-center gap-2 py-3">
          <div className="min-w-40 flex-1">
            <p className="font-bold">{task.title}</p>
            <p className="text-sm text-muted-foreground">{task.description}</p>
            <p className="text-sm">{task.deadline ? (task.deadline.getTime() < Date.now() ? "متأخر · " : "التسليم · ") + new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(task.deadline) : "ميعاد التسليم لسه مش محدد"}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditingHomework(task)}>تعديل التسليم</Button>
          <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate({ taskId: task.id })}><Check /> خلصت</Button>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">الواجب هيظهر هنا أول ما تسجّل حضور حصة.</p>}
    </section>
    {editingHomework && <TaskDialog task={editingHomework} day={today} onClose={() => setEditingHomework(undefined)} onDone={() => utils.invalidate()} />}

    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-bold"><CalendarDays className="size-4 text-primary" aria-hidden />مهام النهارده</h2>
          <Button variant="ghost" size="sm" asChild><Link href="/calendar">التقويم <ArrowLeft /></Link></Button>
        </header>
        {todaysTasks.length ? <ul className="divide-y">
          {todaysTasks.map(task => <li key={task.id} className="study-task-row flex items-center gap-3 px-5 py-3" data-completed={task.status === "completed"}>
            <Button size="icon" variant={task.status === "completed" ? "secondary" : "outline"} disabled={task.status === "completed" || complete.isPending} aria-label={task.status === "completed" ? "مكتملة" : "إكمال " + task.title} onClick={() => complete.mutate({ taskId: task.id })}><Check className={task.status === "completed" ? "study-check" : undefined} /></Button>
            <span className={task.status === "completed" ? "text-muted-foreground line-through" : "font-medium"}>{task.title}</span>
            {task.status !== "completed" && task.priority === "urgent" && <span className="ms-auto rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-800">عاجلة</span>}
          </li>)}
        </ul> : <p className="px-5 py-9 text-sm text-muted-foreground">مفيش مهام مجدولة النهارده.</p>}
      </section>
      <section className="surface p-5">
        <span className="metric-icon bg-primary/10 text-primary"><GraduationCap /></span>
        <h2 className="mt-3 font-bold">الامتحان الجاي</h2>
        {nextExam ? <>
          <p className="mt-3 text-lg font-bold">{nextExam.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{[nextExam.subject, nextExam.scheduledAt && cairoDate.format(new Date(nextExam.scheduledAt))].filter(Boolean).join(" · ")}</p>
        </> : <p className="mt-3 text-sm text-muted-foreground">مفيش امتحان متحدد له معاد.</p>}
        <Button asChild variant="outline" className="mt-4"><Link href="/exams">كل الامتحانات <ArrowLeft /></Link></Button>
      </section>
    </div>

    <section className="surface overflow-hidden">
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="flex items-center gap-2 font-bold"><BookOpen className="size-4 text-primary" aria-hidden />المراجعات المستحقة</h2>
        <Button variant="ghost" size="sm" asChild><Link href="/calendar">التقويم <ArrowLeft /></Link></Button>
      </header>
      {reviews.isLoading ? <p className="p-5 text-sm text-muted-foreground">جارٍ تحميل المراجعات…</p> : reviews.isError ? <p className="p-5 text-sm text-muted-foreground">تعذّر تحميل المراجعات.</p> : due.length ? <ul className="divide-y">{due.slice(0, 6).map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.subject}</p></div>
        <Button variant="outline" size="sm" disabled={review.isPending} onClick={() => review.mutate({ lessonId: item.id })}>راجعت الدرس</Button>
      </li>)}</ul> : <p className="p-5 text-sm text-muted-foreground">مفيش مراجعات مستحقة النهارده.</p>}
      {due.length > 6 && <p className="border-t p-4 text-sm text-muted-foreground">{money.format(due.length - 6)} مراجعات إضافية</p>}
    </section>

    <section aria-label="تقدم المذاكرة" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "وقت المذاكرة", value: minutesLabel(metrics.studyMinutes), Icon: Clock3, href: "/analytics" },
        { label: "الدروس المكتملة", value: money.format(metrics.lessonsCompleted), Icon: BookOpen, href: "/study-plan" },
        { label: "سلسلة المذاكرة", value: money.format(metrics.currentStreak) + " يوم", Icon: Flame, href: "/analytics" },
        { label: "رصيد Coins", value: money.format(coins.balance), Icon: CircleDollarSign, href: "/coins" },
      ].map(({ label, value, Icon, href }) => <Link href={href} key={label} className="surface study-stat study-interactive block p-4 hover:border-primary/40 sm:p-5">
        <span className="metric-icon bg-primary/10 text-primary"><Icon /></span>
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold sm:text-xl">{value}</p>
      </Link>)}
    </section>
  </div>;
}
