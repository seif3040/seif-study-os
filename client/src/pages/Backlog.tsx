import { studySlots } from "@shared/studyPlanner";
import { formatClock } from "@shared/clockFormat";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { completionToast, errorText } from "@/lib/study";
import { plannerFreeTime, plannerMinutes, plannerToday, plannerWeekday } from "@shared/studyPlanner";

export default function Backlog({ compact = false }: { compact?: boolean }) {
  const [bulk, setBulk] = useState<number[]>([]);
  const [showBulk, setShowBulk] = useState(false);
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const complete = trpc.studyPlan.complete.useMutation({
    onSuccess: async result => { completionToast(result, 75); await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  const mark = trpc.planner.markBacklog.useMutation({
    onSuccess: async () => { setBulk([]); await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  const today = plannerToday();
  const calendar = trpc.calendar.list.useQuery({
    from: new Date(today + "T00:00:00+03:00"),
    to: new Date(Date.parse(today + "T00:00:00+02:00") + 86_400_000),
  });
  const state = planner.data;
  const saveStudy = trpc.planner.saveStudy.useMutation({
    onSuccess: async () => { await utils.planner.list.invalidate(); toast.success("اتضاف لخطة مذاكرة النهارده."); },
    onError: error => toast.error(errorText(error)),
  });
  const subjectId = state?.backlogSubjects?.[today] ?? 0;
  const choose = trpc.planner.chooseBacklogSubject.useMutation({
    onSuccess: () => utils.planner.list.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  const lessons = (plan.data?.rows ?? []).filter(row => row.lesson);
  const waiting = lessons.filter(row => state?.backlog?.includes(row.lesson!.id) && row.progress?.status !== "completed");
  const subjects = Array.from(new Map(waiting.map(row => [row.subject.id, row.subject.title])));
  const selected = waiting.filter(row => row.subject.id === subjectId);
  const weekday = plannerWeekday(today);
  const weekly = state?.slots.filter(slot => slot.weekday === weekday) ?? [];
  const cairoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
  const cairoTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const events = (calendar.data?.events ?? []).filter(event => cairoDate.format(event.startsAt) === today);
  const exams = (calendar.data?.exams ?? []).some(exam => exam.scheduledAt && cairoDate.format(exam.scheduledAt) === today);
  const busy = events.filter(event => event.endsAt).map(event => ({
    id: String(event.id), weekday, title: event.title, start: cairoTime.format(event.startsAt),
    end: cairoDate.format(event.endsAt!) === today ? cairoTime.format(event.endsAt!) : "24:00",
  }));
  const freeDay = Boolean(calendar.data) && !weekly.some(slot => slot.subjectId) && !exams
    && !events.some(event => !event.endsAt || state?.milestones.some(item => item.eventId === event.id));
  const now = plannerMinutes(cairoTime.format(new Date()));
  const gaps = state && freeDay ? plannerFreeTime(state.wake, state.sleep, [...weekly, ...busy, ...studySlots(state, today)])
    .map(gap => ({ ...gap, start: Math.max(now, gap.start) })).filter(gap => gap.start < gap.end) : [];
  const available = gaps.reduce((sum, gap) => sum + gap.end - gap.start, 0);
  const scheduled = selected.filter(row => !state?.studySessions?.some(item => item.lessonId === row.lesson!.id && !item.done)).flatMap(row => {
    const duration = row.lesson!.estimatedMinutes;
    const gap = gaps.find(item => item.end - item.start >= duration);
    if (!gap) return [];
    const start = gap.start;
    gap.start += duration;
    return [{ row, start, end: gap.start }];
  });
  return <section className="surface space-y-4 p-5">
    <div className="flex flex-wrap justify-between gap-2">
      <h2 className="text-xl font-bold">الدروس المتراكمة</h2>
      {compact && <Link href="/backlog" className="text-sm text-primary underline">افتح المتراكم</Link>}
    </div>
    {(planner.isError || plan.isError || calendar.isError) && <p role="alert">تعذّر تحميل بعض بيانات المتراكم.</p>}
    {(planner.isLoading || plan.isLoading || calendar.isLoading) && <p>جارٍ تحميل الدروس والوقت المتاح…</p>}
    {!waiting.length && planner.data && plan.data && <p>علّم أي درس كمتراكم من خطة المنهج عشان يظهر هنا.</p>}
    {waiting.length > 0 && available > 0 && <div className="space-y-3 rounded-xl border p-3">
      <p>فاضل النهارده {Math.floor(available / 60)} ساعة و{available % 60} دقيقة.</p>
      <label className="block">هتذاكر متراكم أنهي مادة النهارده؟
        <select className="ms-2 rounded-md border bg-background p-2" value={subjects.some(([id]) => id === subjectId) ? subjectId : 0} disabled={choose.isPending}
          onChange={event => choose.mutate({ subjectId: Number(event.target.value) })}>
          <option value={0} disabled>اختار المادة</option>
          {subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </label>
      {selected.length > 0 && <p>{scheduled.length ? `ينفع تاخد ${scheduled.length} من ${selected.length} درس` : "الفترات الفاضية المتبقية ما تكفيش لأي درس من المادة دي."}</p>}
      <ul className="space-y-2">{scheduled.map(({ row, start, end }) => <li key={row.lesson!.id} className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{row.lesson!.title}</span><span dir="ltr">{formatClock(start)}–{formatClock(end)}</span>
        <Button size="sm" disabled={saveStudy.isPending} onClick={() => {
          const time = (value: number) => [Math.floor(value / 60), value % 60].map(part => String(part).padStart(2, "0")).join(":");
          saveStudy.mutate({ id: crypto.randomUUID(), day: today, start: time(start), end: time(end),
            title: row.lesson!.title, kind: "backlog", lessonId: row.lesson!.id });
        }}>ضيف للمذاكرة</Button>
      </li>)}</ul>
    </div>}
    {waiting.length > 0 && calendar.data && available === 0 && <p className="text-sm text-muted-foreground">
      {freeDay ? "مفيش وقت متاح باقي النهارده." : "عندك حصة أو موعد دراسي النهارده."}
    </p>}
    {!compact && <>
      {subjects.map(([id, title]) => <div key={id} className="space-y-2 rounded-xl border p-3">
        <h3 className="font-bold">{title}</h3>
        {waiting.filter(row => row.subject.id === id).map(row => <div key={row.lesson!.id} className="flex flex-wrap items-center gap-2">
          <span className="flex-1">{row.chapter?.title} · {row.lesson!.title} · {row.lesson!.estimatedMinutes} دقيقة</span>
          <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate({ lessonId: row.lesson!.id })}>خلصت</Button>
        </div>)}
      </div>)}
      <Button variant="outline" onClick={() => setShowBulk(value => !value)}>اختار دروس من المكتمل</Button>
      {showBulk && <div className="space-y-2">
        <div className="max-h-72 space-y-1 overflow-auto">{lessons.filter(row => row.progress?.status === "completed").map(row => <label key={row.lesson!.id} className="block">
          <input type="checkbox" checked={bulk.includes(row.lesson!.id)} onChange={event => {
            const id = row.lesson!.id;
            setBulk(previous => event.target.checked ? [...previous, id].slice(0, 100) : previous.filter(item => item !== id));
          }} /> {row.subject.title} · {row.lesson!.title}
        </label>)}</div>
        <Button disabled={!bulk.length || mark.isPending} onClick={() => mark.mutate({ lessonIds: bulk, marked: true })}>علّم المحدد كمتراكم ({bulk.length})</Button>
      </div>}
    </>}
  </section>;
}
