import { useState } from "react";
import { Link } from "wouter";
import { BookOpen, CheckCircle2, Flag, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, minutesLabel, money } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { studyEfforts, type StudyEffort } from "@shared/weeklyStudy";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Weekly = inferRouterOutputs<AppRouter>["dashboard"]["weeklyStudy"];
type Change = Omit<inferRouterInputs<AppRouter>["dashboard"]["saveWeeklyStudy"], "week">;

function GoalProgress({ goal }: { goal: NonNullable<Weekly["goal"]> }) {
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{goal.title}</span>
      <strong>{money.format(Math.min(goal.done, goal.target))} من {money.format(goal.target)}</strong>
    </div>
    <progress className="h-2 w-full accent-primary" aria-label={goal.title} value={goal.done} max={goal.target} />
    {goal.done >= goal.target && <p className="flex items-center gap-2 text-sm font-bold text-primary"><CheckCircle2 className="size-4" />حققت هدفك</p>}
  </div>;
}

function AchievementDetails({ data }: { data: Weekly }) {
  const badges = [
    data.cleared > 0 && (data.cleared === 1 ? "خلّصت درس من المتراكم" : "خلّصت " + money.format(data.cleared) + " دروس من المتراكم"),
    data.allHomeworkOnTime && "سلّمت كل الواجبات المستحقة في ميعادها",
    data.improved.length > 0 && "حقّقت درجة أعلى في مادة",
  ].filter(Boolean);
  return <section className="surface space-y-3 p-4 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Trophy className="size-5 text-primary" />إنجازاتك بالتفصيل</h2>
    {badges.length > 0 && <ul className="flex flex-wrap gap-2">
      {badges.map(badge => <li key={String(badge)} className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{badge}</li>)}
    </ul>}
    {data.lessons.length === 0 && data.tasks.length === 0 && data.improved.length === 0 && <p className="text-sm text-muted-foreground">الدروس والمهام اللي تخلّصها، وتحسّن درجاتك، هيظهروا هنا.</p>}
    {data.lessons.length > 0 && <details className="rounded-xl border p-3">
      <summary className="cursor-pointer font-semibold">الدروس اللي خلصتها · {money.format(data.lessons.length)}</summary>
      <ul className="mt-2 max-h-52 divide-y overflow-y-auto">{data.lessons.map(lesson =>
        <li key={lesson.id} className="py-2 text-sm">{lesson.subject} · {lesson.title}{lesson.backlog && <span className="ms-2 text-primary">من المتراكم</span>}</li>)}</ul>
    </details>}
    {data.tasks.length > 0 && <details className="rounded-xl border p-3">
      <summary className="cursor-pointer font-semibold">المهام اللي خلصتها · {money.format(data.tasks.length)}</summary>
      <ul className="mt-2 max-h-52 divide-y overflow-y-auto">{data.tasks.map(task => <li key={task.id} className="py-2 text-sm">{task.title}</li>)}</ul>
    </details>}
    {data.improved.length > 0 && <details className="rounded-xl border p-3" open>
      <summary className="cursor-pointer font-semibold">تحسّن درجات الامتحانات</summary>
      <ul className="mt-2 divide-y">{data.improved.map(exam => <li key={exam.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <span>{exam.title}</span><span>من {money.format(exam.previous)}٪ إلى {money.format(exam.score)}٪</span>
      </li>)}</ul>
    </details>}
    {Boolean(data.deferred?.length) && <details className="rounded-xl border p-3">
      <summary className="cursor-pointer font-semibold">مذاكرة اتأجلت ولسه مفتوحة · {money.format(data.deferred.length)}</summary>
      <ul className="mt-2 max-h-52 divide-y overflow-y-auto">{data.deferred.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <span>{item.title}</span><time dateTime={item.day}>{new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(item.day))}</time>
      </li>)}</ul>
      <Link href="/lesson-sources" className="mt-2 inline-block text-sm text-primary underline">افتح جدول الأسبوع</Link>
    </details>}
    {data.recapGoal && <div className="rounded-xl border p-3"><h3 className="mb-2 font-bold">هدف الأسبوع اللي خلص</h3><GoalProgress goal={data.recapGoal} /></div>}
  </section>;
}

function WeeklyGoalForm({ data, busy, submit }: { data: Weekly; busy: boolean; submit(change: Change): Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<"backlog" | "homework">(() => data.choices.subjects.length ? "backlog" : "homework");
  const [subjectId, setSubject] = useState("");
  const [taskId, setTask] = useState("");
  const [target, setTarget] = useState(1);
  const subject = data.choices.subjects.find(item => String(item.id) === subjectId);
  const max = Math.min(20, subject?.count ?? 1);
  const valid = kind === "backlog" ? Boolean(subject) && Number.isInteger(target) && target >= 1 && target <= max : Boolean(taskId);
  const canChoose = data.choices.subjects.length > 0 || data.choices.homework.length > 0;
  return <section className="surface space-y-3 p-4 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Flag className="size-5 text-primary" />هدف الأسبوع</h2>
    {data.goal ? <GoalProgress goal={data.goal} /> : <p className="text-sm text-muted-foreground">اختار هدف واحد. تقدّمك بيتحسب لما تسجّل إنك خلصت.</p>}
    <div className="flex flex-wrap gap-2">
      {canChoose && <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>{data.goal ? "عدّل الهدف" : "اختار هدف"}</Button>}
      {data.goal && <Button variant="ghost" onClick={() => void submit({ goal: null })} disabled={busy}>شيل الهدف</Button>}
    </div>
    {editing && <ActionDialog title="اختار هدف الأسبوع" pending={busy} onClose={() => setEditing(false)}>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (!valid) return;
        const goal = kind === "backlog" && subject
          ? { kind: "backlog" as const, subjectId: subject.id, target }
          : { kind: "homework" as const, taskId: Number(taskId) };
        if (await submit({ goal })) setEditing(false);
      }}>
        <label className="grid gap-1 text-sm">نوع الهدف
          <select value={kind} onChange={event => setKind(event.target.value === "backlog" ? "backlog" : "homework")} className="h-9 rounded-lg border bg-background px-2">
            {data.choices.subjects.length > 0 && <option value="backlog">أخلّص من المتراكم</option>}
            {data.choices.homework.length > 0 && <option value="homework">أخلّص واجب في ميعاده</option>}
          </select>
        </label>
        {kind === "backlog" ? <>
          <label className="grid gap-1 text-sm">المادة
            <select value={subjectId} onChange={event => { setSubject(event.target.value); setTarget(1); }} className="h-9 rounded-lg border bg-background px-2">
              <option value="">اختار مادة</option>
              {data.choices.subjects.map(item => <option key={item.id} value={item.id}>{item.title} · {money.format(item.count)} متراكم</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">عدد الدروس<Input value={target} type="number" min={1} max={max} onChange={event => setTarget(Number(event.target.value))} /></label>
        </> : <label className="grid gap-1 text-sm">الواجب
          <select value={taskId} onChange={event => setTask(event.target.value)} className="h-9 rounded-lg border bg-background px-2">
            <option value="">اختار واجب</option>
            {data.choices.homework.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>}
        <Button type="submit" disabled={!valid || busy}>احفظ الهدف</Button>
      </form>
    </ActionDialog>}
  </section>;
}

export default function WeeklyStudyPanel({ day, friday }: { day: string; friday: boolean }) {
  const query = trpc.dashboard.weeklyStudy.useQuery({ day });
  const save = trpc.dashboard.saveWeeklyStudy.useMutation();
  const utils = trpc.useUtils();
  const [starting, setStarting] = useState<Weekly["suggestions"][number]>();
  const data = query.data;
  if (query.isPending) return <p role="status" className="p-3 text-sm text-muted-foreground">جارٍ تحميل تفاصيل الإنجازات…</p>;
  if (query.isError || !data) return <Button variant="outline" onClick={() => void query.refetch()}>إعادة تحميل خطة الأسبوع</Button>;

  async function submit(change: Change) {
    if (!data) return false;
    try {
      await save.mutateAsync({ week: data.week, ...change });
      await Promise.all([utils.dashboard.weeklyStudy.invalidate(), utils.planner.list.invalidate()]);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  return <>
    <AchievementDetails data={data} />
    <section className="surface space-y-4 border-primary/25 p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="size-5 text-primary" />{friday ? "اختار بداية السبت" : data.pickingSaturday ? "بداية السبت" : "مذاكرة النهارده"}</h2>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="مستوى المذاكرة">
        {(Object.entries(studyEfforts) as [StudyEffort, typeof studyEfforts[StudyEffort]][]).map(([id, option]) =>
          <Button key={id} size="sm" variant={id === data.effort ? "default" : "outline"} aria-pressed={id === data.effort}
            disabled={save.isPending} onClick={() => void submit({ effort: id })}>{option.label}</Button>
        )}
        <span className="text-sm text-muted-foreground">{data.budget >= 5
          ? "وقت الجلسة حسب الفراغ · لحد " + minutesLabel(data.budget)
          : "مفيش وقت كفاية في الجدول لجلسة دلوقتي."}</span>
      </div>
      {data.picked && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
        <div><p className="text-sm text-muted-foreground">اختيارك لبداية السبت</p><p className="font-bold">{data.picked.title}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {!friday && <Button onClick={() => setStarting(data.picked ?? undefined)}>ابدأ</Button>}
          <Button variant="ghost" disabled={save.isPending} onClick={() => void submit({ start: null })}>شيل الاختيار</Button>
        </div>
      </div>}
      {data.suggestions.length > 0 ? <ul className="grid gap-2 sm:grid-cols-3">
        {data.suggestions.map(item => {
          const selected = data.picked?.kind === item.kind && data.picked?.id === item.id;
          return <li key={item.kind + item.id} className="flex min-w-0 flex-col gap-2 rounded-xl border p-3 wrap-anywhere">
            <p className="text-sm font-bold">{item.title}</p>
            <p className="flex-1 text-xs text-muted-foreground">{[item.subject, item.reason, minutesLabel(item.minutes)].filter(Boolean).join(" · ")}</p>
            <Button size="sm" variant={selected ? "secondary" : "outline"} disabled={save.isPending || selected}
              onClick={() => data.pickingSaturday ? void submit({ start: { kind: item.kind, id: item.id } }) : setStarting(item)}>{selected ? "اختيارك" : data.pickingSaturday ? "اختار دي" : "ابدأ"}</Button>
          </li>;
        })}
      </ul> : <p className="text-sm text-muted-foreground">الاقتراحات بتظهر لما يكون فيه درس أو واجب ووقت متاح في الجدول.</p>}
      {starting && <ActionDialog title={starting.title} onClose={() => setStarting(undefined)}>
        <p className="text-sm">{[starting.subject, starting.minutes > 0 && minutesLabel(starting.minutes)].filter(Boolean).join(" · ")}</p>
        {starting.description && <p className="whitespace-pre-line wrap-anywhere text-sm">{starting.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/study-video#pomodoro">افتح البومودورو</Link></Button>
          <Button asChild variant="outline"><Link href={starting.kind === "lesson" ? "/study-plan" : "/homework"}><BookOpen />{starting.kind === "lesson" ? "افتح خطة المنهج" : "افتح الواجبات"}</Link></Button>
        </div>
      </ActionDialog>}
    </section>
    <WeeklyGoalForm key={data.week} data={data} busy={save.isPending} submit={submit} />
  </>;
}
