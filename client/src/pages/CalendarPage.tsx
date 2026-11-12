import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { priorities, TaskDialog, type CalendarTask } from "./Tasks";

const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const dayFormat = new Intl.DateTimeFormat("ar-EG", { dateStyle: "full" });
const monthFormat = new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" });
const numbers = new Intl.NumberFormat("ar-EG");

function dayKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

type Entry = { id: string; label: string; kind: "task" | "deadline" | "exam" | "goal" | "event" | "focus" | "review"; task?: CalendarTask };
const labels = { task: "مهمة", deadline: "آخر موعد", exam: "امتحان", goal: "هدف", event: "تاريخ مهم", focus: "تركيز", review: "مراجعة" };
const colors = {
  task: "bg-teal-100 text-teal-900",
  deadline: "bg-orange-100 text-orange-900",
  exam: "bg-rose-100 text-rose-900",
  goal: "bg-violet-100 text-violet-900",
  event: "bg-amber-100 text-amber-900",
  focus: "bg-sky-100 text-sky-900",
  review: "bg-indigo-100 text-indigo-900",
};

export default function CalendarPage() {
  const utils = trpc.useUtils();
  const search = useSearch();
  const [allTasks, setAllTasks] = useState(() => new URLSearchParams(search).get("view") === "all");
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dialog, setDialog] = useState<{ task?: CalendarTask }>();
  const [eventOpen, setEventOpen] = useState(false);
  const daily = useRef<HTMLElement>(null);
  const dates = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const range = useMemo(() => ({
    from: dates[0],
    to: new Date(dates[41].getFullYear(), dates[41].getMonth(), dates[41].getDate() + 1),
  }), [dates]);
  const taskQuery = trpc.tasks.list.useQuery();
  const calendar = trpc.calendar.list.useQuery(range);
  const reviews = trpc.studyPlan.reviews.useQuery();

  const entries = useMemo(() => {
    const map = new Map<string, Entry[]>();
    function add(date: string | undefined | null, entry: Entry) {
      if (!date) return;
      const list = map.get(date) ?? [];
      list.push(entry);
      map.set(date, list);
    }
    for (const task of taskQuery.data ?? []) {
      const due = task.deadline ? dayKey(new Date(task.deadline)) : undefined;
      add(task.scheduledFor, { id: "task-" + task.id, label: task.title, kind: "task", task });
      if (due && due !== task.scheduledFor) add(due, { id: "due-" + task.id, label: task.title, kind: "deadline", task });
    }
    for (const exam of calendar.data?.exams ?? []) if (exam.scheduledAt) {
      add(dayKey(new Date(exam.scheduledAt)), { id: "exam-" + exam.id, label: exam.title, kind: "exam" });
    }
    for (const goal of calendar.data?.goals ?? []) if (goal.deadline) {
      add(dayKey(new Date(goal.deadline)), { id: "goal-" + goal.id, label: goal.title, kind: "goal" });
    }
    for (const event of calendar.data?.events ?? []) {
      add(dayKey(new Date(event.startsAt)), { id: "event-" + event.id, label: event.title, kind: "event" });
    }
    for (const review of reviews.data ?? []) {
      add(review.day, { id: "review-" + review.id, label: review.title + " · " + review.subject, kind: "review" });
    }
    const focus = new Map<string, number>();
    for (const session of calendar.data?.sessions ?? []) if (session.completedAt) {
      const date = dayKey(new Date(session.completedAt));
      focus.set(date, (focus.get(date) ?? 0) + session.completedMinutes);
    }
    for (const [date, minutes] of focus) {
      add(date, { id: "focus-" + date, label: numbers.format(minutes) + " دقيقة تركيز", kind: "focus" });
    }
    return map;
  }, [taskQuery.data, calendar.data, reviews.data]);

  const refreshTasks = () => Promise.all([
    utils.tasks.list.invalidate(), utils.calendar.list.invalidate(), utils.dashboard.summary.invalidate(),
    utils.analytics.overview.invalidate(), utils.coins.ledger.invalidate(), utils.achievements.list.invalidate(),
  ]);
  const dayEntries = entries.get(selected) ?? [];
  const visibleTasks = allTasks
    ? (taskQuery.data ?? []).map(task => ({ id: "task-" + task.id, label: task.title, kind: "task" as const, task }))
    : dayEntries.filter(entry => entry.task);
  const otherEntries = dayEntries.filter(entry => !entry.task);
  const today = dayKey(new Date());

  function pickDay(date: Date, scroll = true) {
    setSelected(dayKey(date));
    setAllTasks(false);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    if (scroll) daily.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function moveMonth(direction: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    setMonth(next);
    setSelected(dayKey(next));
    setAllTasks(false);
  }

  return <div>
    <PageHeader title="التقويم والجدول اليومي" description="اختار يوم من التقويم عشان تشوف جدوله، أو اضغط على مهمة عشان تفتح تفاصيلها." />
    <div className="mb-4 flex flex-wrap gap-2">
      <Button onClick={() => setDialog({})}><Plus />مهمة جديدة</Button>
      <Button variant="outline" onClick={() => setEventOpen(true)}><CalendarDays />تاريخ مهم</Button>
      <Button variant="ghost" onClick={() => pickDay(new Date(), false)}>اليوم</Button>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="surface overflow-hidden">
        <header className="flex items-center justify-between border-b p-2 sm:p-4">
          <Button variant="ghost" size="icon" aria-label="الشهر السابق" onClick={() => moveMonth(-1)}><ChevronRight /></Button>
          <h2 className="font-bold">{monthFormat.format(month)}</h2>
          <Button variant="ghost" size="icon" aria-label="الشهر التالي" onClick={() => moveMonth(1)}><ChevronLeft /></Button>
        </header>
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-[10px] font-bold sm:text-xs">
          {days.map(label => <div key={label} className="truncate px-0.5 py-2 sm:px-2">{label}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dates.map(date => {
            const key = dayKey(date);
            const items = entries.get(key) ?? [];
            const chosen = key === selected && !allTasks;
            const inMonth = date.getMonth() === month.getMonth();
            return <div key={key} className={"min-h-14 min-w-0 border-b border-l p-0.5 sm:min-h-24 sm:p-1.5 " +
              (chosen ? "bg-primary/10 ring-1 ring-inset ring-primary/35" : inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground")}>
              <button type="button" className="flex w-full items-center justify-center rounded-md py-1 text-xs hover:bg-primary/10 sm:justify-start"
                aria-label={dayFormat.format(date) + (items.length ? "، " + numbers.format(items.length) + " عناصر" : "")}
                aria-pressed={chosen} onClick={() => pickDay(date)}>
                <span className={"flex size-6 items-center justify-center rounded-full " + (key === today ? "bg-primary font-bold text-primary-foreground" : "")}>{numbers.format(date.getDate())}</span>
              </button>
              {items.length > 0 && <>
                <button type="button" className="mx-auto block rounded bg-primary/15 px-1 text-[10px] sm:hidden" aria-label={"عرض عناصر " + dayFormat.format(date)} onClick={() => pickDay(date)}>{numbers.format(items.length)}</button>
                <div className="hidden space-y-1 sm:block">
                  {items.slice(0, 2).map(entry => <button key={entry.id} type="button" title={entry.label}
                    className={"block w-full truncate rounded px-1 py-0.5 text-start text-[10px] " + colors[entry.kind]}
                    onClick={() => {
                      pickDay(date, !entry.task);
                      if (entry.task) setDialog({ task: entry.task });
                    }}>{entry.label}</button>)}
                  {items.length > 2 && <button type="button" className="text-[10px] text-muted-foreground hover:underline" onClick={() => pickDay(date)}>+{numbers.format(items.length - 2)} أخرى</button>}
                </div>
              </>}
            </div>;
          })}
        </div>
      </div>

      <section ref={daily} className="surface scroll-mt-24 overflow-hidden" aria-label="الجدول اليومي">
        <header className="border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{allTasks ? "كل المهام" : "الجدول اليومي"}</h2>
            <Button size="sm" variant="outline" onClick={() => setAllTasks(value => !value)}>{allTasks ? "جدول اليوم المحدد" : "كل المهام"}</Button>
          </div>
          {!allTasks && <p className="mt-1 text-sm text-muted-foreground">{dayFormat.format(new Date(selected + "T12:00:00"))}</p>}
        </header>
        {taskQuery.isLoading ? <p className="p-4 text-sm text-muted-foreground">جارٍ تحميل المهام…</p> :
          taskQuery.isError ? <div className="space-y-2 p-4 text-sm" role="alert"><p>تعذّر تحميل المهام.</p><Button size="sm" variant="outline" onClick={() => void taskQuery.refetch()}>إعادة المحاولة</Button></div> :
          visibleTasks.length ? <ul className="max-h-[36rem] divide-y overflow-auto">
            {visibleTasks.map(entry => {
              const task = entry.task!;
              return <li key={entry.id}>
                <button type="button" className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-muted/60" onClick={() => setDialog({ task })}>
                  <span className={"min-w-0 flex-1 break-words text-sm font-semibold " + (task.status === "completed" ? "text-muted-foreground line-through" : "")}>{task.title}</span>
                  <Badge className={priorities[task.priority].tone}>{priorities[task.priority].label}</Badge>
                  {entry.kind === "deadline" && <Badge variant="outline">آخر موعد</Badge>}
                  {allTasks && <span className="basis-full text-xs text-muted-foreground">{task.scheduledFor ?? "غير مجدولة"}</span>}
                </button>
              </li>;
            })}
          </ul> : <p className="p-4 text-sm text-muted-foreground">{allTasks ? "لسه مفيش مهام." : "مفيش مهام في اليوم ده."}</p>}
        {!allTasks && calendar.isError && <div className="border-t p-4 text-sm" role="alert">تعذّر تحميل المواعيد. <Button size="sm" variant="ghost" onClick={() => void calendar.refetch()}>إعادة المحاولة</Button></div>}
        {!allTasks && otherEntries.length > 0 && <div className="border-t p-4">
          <h3 className="mb-2 text-sm font-bold">مواعيد ونشاط اليوم</h3>
          <ul className="space-y-2">{otherEntries.map(entry => <li key={entry.id} className="flex items-start gap-2 text-sm"><Badge className={colors[entry.kind]}>{labels[entry.kind]}</Badge><span>{entry.label}</span></li>)}</ul>
        </div>}
      </section>
    </div>

    {dialog && <TaskDialog key={dialog.task?.id ?? selected} task={dialog.task} day={selected} onDone={refreshTasks} onClose={() => setDialog(undefined)} />}
    {eventOpen && <EventDialog day={selected} onClose={() => setEventOpen(false)} onDone={() => utils.calendar.list.invalidate()} />}
  </div>;
}

function EventDialog({ day, onClose, onDone }: { day: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day + "T09:00");
  const mutation = trpc.calendar.create.useMutation({
    onSuccess: async () => { toast.success("تمت إضافة التاريخ المهم."); onClose(); await onDone(); },
    onError: error => toast.error(errorText(error)),
  });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mutation.isPending && title.trim() && date) mutation.mutate({ title: title.trim(), startsAt: new Date(date), eventType: "important_date" });
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>تاريخ مهم</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={save}>
        <label className="block space-y-1"><span>اسم الموعد</span><Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></label>
        <label className="block space-y-1"><span>التاريخ والوقت</span><Input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required /></label>
        <DialogFooter><Button type="submit" disabled={!title.trim() || !date || mutation.isPending}><Plus />إضافة</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
