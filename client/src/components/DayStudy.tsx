import { useState } from "react";
import { Link } from "wouter";
import { BookOpen, GraduationCap, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";
import { plannerWeekday, studySlots, upcomingClassLessons, plannerPolicy, type PlannedStudy } from "@shared/studyPlanner";

const kinds = { study: "مذاكرة", homework: "واجب", review: "مراجعة", backlog: "متراكم" };

export default function DayStudy({ day, showSchedule = false }: { day: string; showSchedule?: boolean }) {
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery(undefined, { enabled: showSchedule });
  const sources = trpc.lessonSources.list.useQuery(undefined, { enabled: showSchedule });
  const utils = trpc.useUtils();
  const [editor, setEditor] = useState<PlannedStudy>();
  const onError = (error: unknown) => toast.error(errorText(error));
  const save = trpc.planner.saveStudy.useMutation({
    onSuccess: async () => { await utils.planner.list.invalidate(); setEditor(undefined); }, onError,
  });
  const done = trpc.planner.finishStudy.useMutation({ onSuccess: () => utils.invalidate(), onError });
  const remove = trpc.planner.removeStudy.useMutation({ onSuccess: () => utils.planner.list.invalidate(), onError });
  const state = planner.data;
  if (planner.isError) return <p role="alert">تعذّر تحميل خطة اليوم.</p>;
  if (!state) return <p>جارٍ تحميل خطة اليوم…</p>;
  const sessions = studySlots(state, day).sort((a, b) => a.start.localeCompare(b.start));
  const slots = state.slots.filter(item => item.weekday === plannerWeekday(day)).sort((a, b) => a.start.localeCompare(b.start));
  const classes = slots.filter(slot => slot.subjectId);
  const commitments = slots.filter(slot => !slot.subjectId);

  return <div className="space-y-4">
    {showSchedule && <section className="surface space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><GraduationCap className="size-5" /> عندي حصة</h2>
        <Link href="/lesson-sources" className="text-sm text-primary underline">جدول الأسبوع وتسجيل الحضور</Link>
      </div>
      {!classes.length && <p className="text-sm text-muted-foreground">مفيش حصص النهارده.</p>}
      {classes.map(slot => {
        const rows = (plan.data?.rows ?? []).filter(row => row.subject.id === slot.subjectId && row.lesson);
        const source = sources.data?.find(item => item.id === slot.sourceId);
        const attended = state.attendance.filter(item => item.slotId === slot.id && item.day === day);
        const next = rows[0] && plannerPolicy(rows[0].subject.title) !== "arabic"
          ? upcomingClassLessons(rows, state, slot.subjectId!)[0]?.lesson?.title : undefined;
        return <div key={slot.id} className="rounded-xl border p-3">
          <p className="font-bold">{slot.title} · {formatClock(slot.start)} – {formatClock(slot.end)}</p>
          {source && <p className="text-sm text-muted-foreground">{source.teacherName}</p>}
          {attended.length ? <p className="text-sm">حضرت · {attended.map(item => item.lessonTitle).join("، ")}</p>
            : next && <p className="text-sm">الدرس المتوقع · {next}</p>}
        </div>;
      })}
    </section>}
    <section className="surface space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><BookOpen className="size-5" /> {showSchedule ? "هذاكر النهارده" : "خطة المذاكرة"}</h2>
        <Button size="sm" variant="outline" onClick={() => setEditor({ id: crypto.randomUUID(), day, title: "", start: "17:00", end: "17:30", kind: "study" })}>ضيف للمذاكرة</Button>
      </div>
      {!sessions.length && <p className="text-sm text-muted-foreground">لسه مفيش مذاكرة متخططة لليوم ده.</p>}
      {sessions.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <div className="min-w-40 flex-1">
          <p className="font-bold">{item.title}</p>
          <p className="text-sm">{kinds[item.kind]} · {formatClock(item.start)} – {formatClock(item.end)}</p>
        </div>
        {item.done ? <span className="text-sm">خلصت</span> : <>
          <Button size="sm" disabled={done.isPending} onClick={() => done.mutate({ id: item.id })}>خلصت المذاكرة</Button>
          <Button size="sm" variant="outline" onClick={() => setEditor(item)}>نقل أو تعديل</Button>
          <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate({ id: item.id })}>شيل من الخطة</Button>
        </>}
      </div>)}
      {editor && <form className="grid gap-2 rounded-xl border p-3" onSubmit={event => { event.preventDefault(); save.mutate(editor); }}>
        <label>هتذاكر إيه؟<Input required maxLength={200} value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label>اليوم<Input type="date" required value={editor.day} onChange={event => setEditor({ ...editor, day: event.target.value })} /></label>
          <label>من<Input type="time" required value={editor.start} onChange={event => setEditor({ ...editor, start: event.target.value })} /></label>
          <label>لحد<Input type="time" required value={editor.end} onChange={event => setEditor({ ...editor, end: event.target.value })} /></label>
          <label>النوع<select className="block h-10 w-full rounded-md border bg-background px-2" value={editor.kind} disabled={Boolean(editor.lessonId)}
            onChange={event => setEditor({ ...editor, kind: event.target.value as PlannedStudy["kind"] })}>
            {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>حفظ</Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setEditor(undefined)}>إلغاء</Button></div>
      </form>}
    </section>
    {showSchedule && <section className="surface space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><CalendarClock className="size-5" /> الالتزامات</h2>
      {!commitments.length && <p className="text-sm text-muted-foreground">مفيش التزامات أسبوعية النهارده.</p>}
      {commitments.map(slot => <p key={slot.id}>{slot.title} · {formatClock(slot.start)} – {formatClock(slot.end)}</p>)}
    </section>}
  </div>;
}
