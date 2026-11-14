import DayStudy from "@/components/DayStudy";
import { studySlots } from "@shared/studyPlanner";
import { formatClock } from "@shared/clockFormat";
import { upcomingClassLessons } from "@shared/studyPlanner";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { CalendarClock, Check, Clock3, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { emptyPlanner, overlapsPlannerSlot, plannerDays, plannerFreeTime, plannerPolicy, plannerToday, plannerWeekday, shiftPlannerDay, type PlannerSlot } from "@shared/studyPlanner";

const timeLabel = (minutes: number) => [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, "0")).join(":");
const selectStyle = "h-10 w-full rounded-md border bg-background px-2";

export default function WeekPlanner() {
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const sources = trpc.lessonSources.list.useQuery();
  const utils = trpc.useUtils();
  const today = plannerToday();
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<PlannerSlot>();
  const [attending, setAttending] = useState<string>();
  const [chosen, setChosen] = useState<number[]>([]);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const state = planner.data ?? emptyPlanner;
  const weekday = plannerWeekday(day);
  const weekStart = shiftPlannerDay(day, -((weekday + 1) % 7));
  const rows = plan.data?.rows ?? [];
  const subjects = Array.from(new Map(rows.map(row => [row.subject.id, row.subject])).values());
  const slots = state.slots.filter(slot => slot.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start));
  const datedSlots = state.milestones.flatMap(item => {
    if (item.day !== day || !item.start || !item.minutes) return [];
    const [hour, minute] = item.start.split(":").map(Number);
    return [{ id: item.id, weekday, start: item.start, end: timeLabel(Math.min(1440, hour * 60 + minute + item.minutes)), title: item.title }];
  });
  const gaps = plannerFreeTime(state.wake, state.sleep, [...slots, ...datedSlots, ...studySlots(state, day)]);
  const free = gaps.reduce((sum, gap) => sum + gap.end - gap.start, 0);
  const teacherNext = trpc.planner.teacherNext.useMutation({
    onSuccess: () => utils.planner.list.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  const onError = (error: unknown) => toast.error(errorText(error));
  const refresh = async () => { await utils.planner.list.invalidate(); };
  const hours = trpc.planner.hours.useMutation({ onSuccess: refresh, onError });
  const save = trpc.planner.saveSlot.useMutation({
    onSuccess: async () => { await refresh(); setEditing(undefined); },
    onError,
  });
  const remove = trpc.planner.removeSlot.useMutation({ onSuccess: refresh, onError });
  const attend = trpc.planner.attend.useMutation({
    onSuccess: async () => {
      await Promise.all([refresh(), utils.tasks.list.invalidate(), utils.dashboard.summary.invalidate()]);
      setAttending(undefined);
      toast.success("اتسجّل الحضور واتضاف الواجب.");
    },
    onError,
  });
  const milestone = trpc.planner.schedule.useMutation({
    onSuccess: async () => { await Promise.all([refresh(), utils.calendar.list.invalidate()]); toast.success("اتحفظ الموعد في التقويم."); },
    onError,
  });

  function submitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    hours.mutate({ wake: String(values.get("wake")), sleep: String(values.get("sleep")) });
  }

  if (planner.isLoading || plan.isLoading) return <p className="mb-6">جارٍ تحميل الجدول…</p>;
  if (planner.isError || plan.isError) return <p className="mb-6" role="alert">تعذّر تحميل الجدول.</p>;

  return <section className="mb-8 space-y-4">
    <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><CalendarClock className="size-5" /> أسبوعك</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setDay(shiftPlannerDay(day, -7))}>الأسبوع السابق</Button>
          <Button variant="outline" size="sm" onClick={() => setDay(today)}>النهارده</Button>
          <Button variant="outline" size="sm" onClick={() => setDay(shiftPlannerDay(day, 7))}>الأسبوع القادم</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => {
          const date = shiftPlannerDay(weekStart, index);
          return <Button key={date} variant={date === day ? "default" : "outline"} aria-pressed={date === day}
            onClick={() => { setDay(date); setEditing(undefined); setAttending(undefined); }}>
            {plannerDays[plannerWeekday(date)]} {date.slice(8)}
          </Button>;
        })}
      </div>
      <form key={state.wake + state.sleep} onSubmit={submitHours} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">الصحوة<Input type="time" name="wake" defaultValue={state.wake} required /></label>
        <label className="text-sm">النوم<Input type="time" name="sleep" defaultValue={state.sleep} required /></label>
        <Button type="submit" variant="outline" disabled={hours.isPending}>حفظ ساعات اليوم</Button>
      </form>
    </div>
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">{plannerDays[weekday]} · {day}</h3>
          <Button size="sm" onClick={() => {
            setAllowOverlap(false);
            setEditing({ id: crypto.randomUUID(), weekday, title: "", start: "16:00", end: "17:00" });
          }}><Plus /> ميعاد أسبوعي</Button>
        </div>
        {editing && <form className="grid gap-2 rounded-xl border p-3" onSubmit={event => {
          event.preventDefault();
          save.mutate({ slot: editing, allowOverlap });
        }}>
          <label>العنوان<Input value={editing.title} required maxLength={200} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label>من<Input type="time" required value={editing.start} onChange={event => setEditing({ ...editing, start: event.target.value })} /></label>
            <label>لحد<Input type="time" required value={editing.end} onChange={event => setEditing({ ...editing, end: event.target.value })} /></label>
          </div>
          <label>نوع الموعد<select className={selectStyle} value={editing.subjectId ? "class" : "commitment"} onChange={event => {
            const subjectId = event.target.value === "class" ? subjects[0]?.id : undefined;
            setEditing({ ...editing, subjectId });
          }}>
            <option value="commitment">التزام شخصي (المدرسة، المواصلات، وغيره)</option>
            <option value="class" disabled={!subjects.length}>حصة مرتبطة بالمنهج</option>
          </select></label>
          {editing.subjectId && <label>المادة<select className={selectStyle} value={editing.subjectId} onChange={event => setEditing({ ...editing, subjectId: Number(event.target.value) })}>
            {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
          </select></label>}
          <label>المصدر (اختياري)<select className={selectStyle} value={editing.sourceId ?? ""} onChange={event => setEditing({ ...editing, sourceId: Number(event.target.value) || undefined })}>
            <option value="">من غير مصدر</option>
            {(sources.data ?? []).map(source => <option key={source.id} value={source.id}>{source.subject} · {source.teacherName}</option>)}
          </select></label>
          {overlapsPlannerSlot(editing, state.slots) && <label className="text-sm text-destructive"><input type="checkbox" checked={allowOverlap} onChange={event => setAllowOverlap(event.target.checked)} /> الموعد متداخل. احفظه رغم التداخل.</label>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>حفظ</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>إلغاء</Button>
          </div>
        </form>}
        {datedSlots.map(slot => <article key={slot.id} className="flex justify-between gap-2 rounded-xl border p-3">
          <h4 className="font-bold">{slot.title}</h4><span dir="ltr">{formatClock(slot.start)} – {formatClock(slot.end)}</span>
        </article>)}
        {!slots.length && !datedSlots.length && <p className="text-sm text-muted-foreground">مفيش مواعيد متكررة في اليوم ده.</p>}
        {[true, false].map(isClass => <section key={String(isClass)} className="space-y-2">
          <h4 className="font-bold">{isClass ? "عندي حصة" : "الالتزامات"}</h4>
          {slots.filter(slot => Boolean(slot.subjectId) === isClass).map(slot => {
          const source = sources.data?.find(item => item.id === slot.sourceId);
          const subject = subjects.find(item => item.id === slot.subjectId);
          const recorded = state.attendance.filter(item => item.slotId === slot.id && item.day === day);
          const subjectRows = rows.filter(row => row.subject.id === slot.subjectId && row.lesson);
          const remaining = slot.subjectId ? upcomingClassLessons(subjectRows, state, slot.subjectId) : [];
          const arabic = subject && plannerPolicy(subject.title) === "arabic";
          const next = remaining[0]?.lesson;
          return <article key={slot.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold">{slot.title}</h4>
              <span dir="ltr" className="text-sm">{formatClock(slot.start)} – {formatClock(slot.end)}</span>
            </div>
            {source && <div className="text-sm text-muted-foreground">
              {source.teacherName} · {source.platform}{source.location && " · " + source.location}
              {source.url && (source.url.startsWith("https://") || source.url.startsWith("http://")) && <a className="ms-2 inline-flex items-center gap-1 text-primary underline" href={source.url} target="_blank" rel="noreferrer">المصدر <ExternalLink className="size-3" /></a>}
            </div>}
            {recorded.length > 0 && <p className="text-sm">حضرْت · {recorded.map(item => item.lessonTitle).join("، ")}</p>}
            {subject && !arabic && <label className="block text-sm">المدرس وصل لفين؟
              <select className={selectStyle} value={state.teacherNext?.[subject.id] ?? ""} disabled={teacherNext.isPending}
                onChange={event => teacherNext.mutate({ subjectId: subject.id, lessonId: Number(event.target.value) || undefined })}>
                <option value="">حسب ترتيب المنهج والحضور</option>
                {subjectRows.filter(row => !state.backlog?.includes(row.lesson!.id)).map(row => <option key={row.lesson!.id} value={row.lesson!.id}>{row.lesson!.title}</option>)}
              </select>
            </label>}
            {!recorded.length && next && !arabic && <p className="text-sm">الدرس التالي · {next.title}</p>}
            {attending === slot.id && arabic && <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded border p-2">
              <legend>اختار كل الدروس اللي اتشرحت في المحاضرة</legend>
              {remaining.map(row => <label key={row.lesson!.id} className="block text-sm">
                <input type="checkbox" checked={chosen.includes(row.lesson!.id)} onChange={event => {
                  const id = row.lesson!.id;
                  setChosen(items => event.target.checked ? [...items, id] : items.filter(item => item !== id));
                }} /> {row.chapter?.title} · {row.lesson!.title}
              </label>)}
            </fieldset>}
            <div className="flex flex-wrap gap-2">
              {!recorded.length && next && day <= today && <Button size="sm" disabled={attend.isPending || Boolean(arabic && attending === slot.id && !chosen.length)}
                onClick={() => {
                  if (arabic && attending !== slot.id) { setChosen([]); setAttending(slot.id); return; }
                  attend.mutate({ slotId: slot.id, day, lessonIds: arabic ? chosen : [next.id] });
                }}><Check /> {attending === slot.id ? "حفظ المحاضرة" : "حضرت الحصة"}</Button>}
              <Button size="sm" variant="outline" onClick={() => { setEditing(slot); setAllowOverlap(false); }}>تعديل</Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => {
                if (window.confirm("تشيل الميعاد المتكرر من جدول الأسبوع؟")) remove.mutate({ id: slot.id });
              }}>إزالة الموعد</Button>
            </div>
          </article>;
        })}
        </section>)}
      </div>
      <div className="surface space-y-3 p-4">
        <h3 className="flex items-center gap-2 font-bold"><Clock3 className="size-5" /> الوقت الفاضي</h3>
        <p>{Math.floor(free / 60)} ساعة و{free % 60} دقيقة</p>
        <ul className="space-y-2">{gaps.map(gap => <li key={gap.start} dir="ltr" className="rounded-lg bg-muted p-2 text-center text-sm">{formatClock(gap.start)} – {formatClock(gap.end)}</li>)}</ul>
      </div>
    </div>
    <DayStudy key={day} day={day} />
    {state.milestones.length > 0 && <div className="surface space-y-3 p-4">
      <h3 className="font-bold">الورش والامتحانات ومعسكرات المراجعة</h3>
      {state.milestones.map(item => <form key={item.id + ":" + (state.milestones.find(value => value.id === item.follows)?.day ?? "")} className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        onSubmit={event => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          milestone.mutate({ id: item.id, day: String(values.get("day")), start: String(values.get("start")),
            minutes: item.duration ?? Number(values.get("minutes")) });
        }}>
        <div className="min-w-44 flex-1"><p className="font-bold">{item.title}</p><p className="text-sm text-muted-foreground">{item.eventId ? "اتضاف للتقويم" : "بانتظار الموعد"}</p></div>
        <label>اليوم<Input name="day" type="date" defaultValue={item.day ?? (() => {
          const previous = state.milestones.find(value => value.id === item.follows);
          return previous?.day ? shiftPlannerDay(previous.day, 7) : undefined;
        })()} required /></label>
        <label>الساعة<Input name="start" type="time" defaultValue={item.start} required /></label>
        {item.duration ? <span>{item.duration / 60} ساعات</span> : <label>الدقائق<Input name="minutes" type="number" min={5} max={1440} defaultValue={item.minutes ?? 60} required /></label>}
        <Button type="submit" size="sm" disabled={milestone.isPending}>حفظ الموعد</Button>
      </form>)}
    </div>}
  </section>;
}
