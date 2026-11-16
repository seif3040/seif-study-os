import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, CheckSquare, Coffee, Moon, Sun, Timer } from "lucide-react";
import { Link } from "wouter";
import { plannerToday, plannerWeekday, shiftPlannerDay } from "@shared/studyPlanner";
import { Button } from "@/components/ui/button";
import { minutesLabel, money } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const timeZone = "Africa/Cairo";
const cairoHour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" });
const dateLabel = new Intl.DateTimeFormat("ar-EG", { timeZone, dateStyle: "full" });
const recapDate = new Intl.DateTimeFormat("ar-EG", { timeZone, weekday: "long", day: "numeric", month: "short" });
const emptyDay = { minutes: 0, lessons: 0, tasks: 0, sessions: 0 };

function dateAtNoon(day: string) {
  return new Date(day + "T12:00:00Z");
}

export default function Welcome() {
  const [now, setNow] = useState(() => new Date());
  const today = plannerToday(now);
  const friday = plannerWeekday(today) === 5;
  const start = friday ? shiftPlannerDay(today, -7) : today;
  const end = friday ? shiftPlannerDay(today, -1) : today;
  const recap = trpc.dashboard.welcome.useQuery({ day: today });
  const morning = Number(cairoHour.format(now)) < 12;
  const GreetingIcon = morning ? Sun : Moon;

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const days = Array.from({ length: friday ? 7 : 1 }, (_, index) => {
    const day = shiftPlannerDay(start, index);
    return { ...emptyDay, ...recap.data?.[day], day };
  });
  const totals = days.reduce((sum, day) => ({
    minutes: sum.minutes + day.minutes, lessons: sum.lessons + day.lessons,
    tasks: sum.tasks + day.tasks, sessions: sum.sessions + day.sessions,
  }), emptyDay);
  const max = Math.max(1, ...days.map(day => day.minutes));

  return <div className="mx-auto max-w-5xl space-y-5">
    <section className="study-hero space-y-4 rounded-[2rem] p-6 sm:p-9">
      <p className="flex items-center gap-2 text-sm text-white/85"><CalendarDays className="size-4" />{dateLabel.format(now)}</p>
      <h1 className="flex items-center gap-3 text-3xl font-extrabold sm:text-5xl">
        <GreetingIcon className="size-8 shrink-0 sm:size-11" aria-hidden />{morning ? "صباح الخير يا سيف" : "مساء الخير يا سيف"}
      </h1>
      {friday && <p className="flex items-center gap-2 font-medium"><Coffee className="size-5" aria-hidden />النهارده إجازة. استمتع بيومك يا سيف!</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild className="study-hero-action"><Link href="/today">افتح النهارده <ArrowLeft /></Link></Button>
      </div>
    </section>

    <section className="surface space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">{friday ? "ملخص إنجازات الأسبوع اللي فات" : "إنجازاتك النهارده"}</h2>
        {friday && <p className="mt-1 text-sm text-muted-foreground">{recapDate.format(dateAtNoon(start))} – {recapDate.format(dateAtNoon(end))}</p>}
      </div>
      {recap.isPending ? <p role="status">جارٍ تحميل إنجازاتك…</p> : recap.isError
        ? <Button variant="outline" onClick={() => void recap.refetch()}>إعادة تحميل الإنجازات</Button>
        : <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: "وقت المذاكرة", value: minutesLabel(totals.minutes), Icon: Timer },
              { label: "دروس مكتملة", value: money.format(totals.lessons), Icon: BookOpen },
              { label: "مهام مكتملة", value: money.format(totals.tasks), Icon: CheckSquare },
              { label: "جلسات بومودورو", value: money.format(totals.sessions), Icon: Coffee },
            ].map(({ label, value, Icon }) => <div key={label} className="rounded-xl border bg-secondary/40 p-3">
              <Icon className="mb-2 size-5 text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p>
            </div>)}
          </div>
          {friday && <ul className="divide-y">
            {days.map(day => <li key={day.day} className="grid gap-2 py-3 sm:grid-cols-[11rem_1fr_10rem] sm:items-center">
              <time dateTime={day.day} className="text-sm font-medium">{recapDate.format(dateAtNoon(day.day))}</time>
              <progress className="h-2 w-full accent-primary" value={day.minutes} max={max} aria-label="وقت المذاكرة" />
              <span className="text-sm text-muted-foreground">{minutesLabel(day.minutes)} · {money.format(day.lessons)} درس · {money.format(day.tasks)} مهمة</span>
            </li>)}
          </ul>}
        </>}
      <Button asChild variant="outline"><Link href="/analytics">كل التحليلات <ArrowLeft /></Link></Button>
    </section>
  </div>;
}
