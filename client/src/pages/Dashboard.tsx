import { ArrowLeft, BookOpen, CalendarDays, Check, CircleDollarSign, Clock3, Flame, GraduationCap, Sparkles, Timer } from "lucide-react";
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
  const summary = trpc.dashboard.summary.useQuery();
  const utils = trpc.useUtils();
  const complete = trpc.tasks.complete.useMutation({
    onSuccess: async () => { await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  if (summary.isLoading) return <div className="space-y-4" aria-label="جارٍ تحميل اليوم"><div className="h-60 animate-pulse rounded-3xl bg-muted" /><div className="h-48 animate-pulse rounded-3xl bg-muted" /></div>;
  if (!summary.data) return <EmptyState title="تعذّر تحميل اليوم" description="جرّب تفتح الصفحة تاني." />;

  const { metrics, coins, todaysTasks, upcomingExams, ongoingPomodoro } = summary.data;
  const finished = todaysTasks.filter(task => task.status === "completed").length;
  const nextExam = upcomingExams[0];

  return <div className="space-y-5">
    <section className="study-hero rounded-[2rem] p-6 sm:p-9">
      <p className="flex items-center gap-2 text-sm text-white/85"><CalendarDays className="size-4" />{cairoDate.format(new Date())}</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">النهارده</h1>
      <p className="mt-3 text-sm text-white/85">{money.format(finished)} من {money.format(todaysTasks.length)} مهام خلصت</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild className="bg-white text-indigo-950 hover:bg-indigo-100"><Link href="/pomodoro"><Timer />{ongoingPomodoro ? "كمّل جلسة التركيز" : "ابدأ بومودورو"}</Link></Button>
        <Button asChild variant="outline" className="border-white/50 bg-transparent text-white hover:bg-white/15 hover:text-white"><Link href="/seify"><Sparkles />كلم جارفيس</Link></Button>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b px-5 py-4">
          <h2 className="font-bold">مهام النهارده</h2>
          <Button variant="ghost" size="sm" asChild><Link href="/calendar">التقويم <ArrowLeft /></Link></Button>
        </header>
        {todaysTasks.length ? <ul className="divide-y">
          {todaysTasks.map(task => <li key={task.id} className="flex items-center gap-3 px-5 py-3">
            <Button size="icon" variant={task.status === "completed" ? "secondary" : "outline"} disabled={task.status === "completed" || complete.isPending} aria-label={task.status === "completed" ? "مكتملة" : "إكمال " + task.title} onClick={() => complete.mutate({ taskId: task.id })}><Check /></Button>
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

    <section aria-label="تقدم المذاكرة" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "وقت المذاكرة", value: minutesLabel(metrics.studyMinutes), Icon: Clock3, href: "/analytics" },
        { label: "الدروس المكتملة", value: money.format(metrics.lessonsCompleted), Icon: BookOpen, href: "/study-plan" },
        { label: "سلسلة المذاكرة", value: money.format(metrics.currentStreak) + " يوم", Icon: Flame, href: "/analytics" },
        { label: "رصيد Coins", value: money.format(coins.balance), Icon: CircleDollarSign, href: "/coins" },
      ].map(({ label, value, Icon, href }) => <Link href={href} key={label} className="surface block p-4 hover:border-primary/40 sm:p-5">
        <span className="metric-icon bg-primary/10 text-primary"><Icon /></span>
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-bold sm:text-xl">{value}</p>
      </Link>)}
    </section>
  </div>;
}
