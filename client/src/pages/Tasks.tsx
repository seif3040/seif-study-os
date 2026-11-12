import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { completionToast, errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Pencil } from "lucide-react";
import { toast } from "sonner";

export type CalendarTask = NonNullable<ReturnType<typeof trpc.tasks.list.useQuery>["data"]>[number];

export const priorities = {
  urgent: { label: "عاجل", tone: "bg-rose-100 text-rose-800", coins: 30 },
  medium: { label: "متوسط", tone: "bg-amber-100 text-amber-800", coins: 20 },
  low: { label: "منخفض", tone: "bg-emerald-100 text-emerald-800", coins: 10 },
} as const;

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function TaskDialog({ task, initialTitle, day, onClose, onDone }: {
  task?: CalendarTask;
  initialTitle?: string; day: string; onClose: () => void; onDone: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(!task);
  const [title, setTitle] = useState(task?.title ?? initialTitle ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [scheduledFor, setScheduledFor] = useState(task ? task.scheduledFor ?? "" : day);
  const [deadline, setDeadline] = useState(task?.deadline ? localDateTime(new Date(task.deadline)) : "");
  const [priority, setPriority] = useState<keyof typeof priorities>(task?.priority ?? "medium");
  const [category, setCategory] = useState(task?.category ?? "");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const recurring = trpc.tasks.createRecurring.useMutation();
  const create = trpc.tasks.create.useMutation();
  const update = trpc.tasks.update.useMutation();
  const remove = trpc.tasks.delete.useMutation();
  const complete = trpc.tasks.complete.useMutation();
  const pending = remove.isPending || recurring.isPending || create.isPending || update.isPending || complete.isPending;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    const input = {
      title: title.trim(),
      description: description || undefined,
      scheduledFor: scheduledFor || undefined,
      deadline: deadline ? new Date(deadline) : undefined,
      priority,
      category: category.trim() || undefined,
    };
    try {
      if (!task && repeat) {
        if (!scheduledFor || !weekdays.length || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) return;
        const result = await recurring.mutateAsync({
          title: input.title, description: input.description, category: input.category, priority: input.priority,
          startsOn: scheduledFor, weekdays, weeks,
        });
        toast.success("اتضافت " + result.added + " مهمة" + (result.skipped ? " واتخطّينا " + result.skipped + " مكررة." : "."));
        onClose();
        await onDone();
        return;
      }
      if (task) await update.mutateAsync({ taskId: task.id, ...input });
      else await create.mutateAsync(input);
    } catch (error) {
      toast.error(errorText(error));
      return;
    }
    toast.success(task ? "تم تحديث المهمة." : "تمت إضافة المهمة.");
    onClose();
    await onDone();
  }

  async function postpone() {
    if (!task || pending) return;
    const next = new Date((task.scheduledFor ?? day) + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    try {
      await update.mutateAsync({
        taskId: task.id, title: task.title, description: task.description ?? undefined,
        scheduledFor: next.toISOString().slice(0, 10), deadline: task.deadline ? new Date(task.deadline) : undefined,
        priority: task.priority, category: task.category,
      });
      toast.success("اتأجّلت المهمة يوم.");
      onClose();
      await onDone();
    } catch (error) { toast.error(errorText(error)); }
  }

  async function moveToTrash() {
    if (!task || pending) return;
    try {
      await remove.mutateAsync({ taskId: task.id });
      toast.success("المهمة راحت لسلة المحذوفات في الإعدادات.");
      onClose();
      await onDone();
    } catch (error) { toast.error(errorText(error)); }
  }

  async function finish() {
    if (!task || pending) return;
    try {
      const result = await complete.mutateAsync({ taskId: task.id });
      completionToast(result, priorities[task.priority].coins);
      onClose();
      await onDone();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editing ? (task ? "تعديل المهمة" : "مهمة جديدة") : task?.title}</DialogTitle></DialogHeader>
      {editing ? <form className="space-y-4" onSubmit={save}>
        <label className="block space-y-1"><span>اسم المهمة</span><Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></label>
        <label className="block space-y-1"><span>التفاصيل</span><Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1"><span>اليوم المجدول</span><Input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} required={!task} /></label>
          <label className="block space-y-1"><span>آخر موعد</span><Input type="datetime-local" disabled={repeat} value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
          <label className="block space-y-1"><span>الأولوية</span><select className="h-10 w-full rounded-md border bg-background px-2" value={priority} onChange={e => setPriority(e.target.value as keyof typeof priorities)}>
            {Object.entries(priorities).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select></label>
          <label className="block space-y-1"><span>التصنيف</span><Input value={category} onChange={e => setCategory(e.target.value)} placeholder="دراسة" maxLength={80} /></label>
        </div>
        {!task && <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />مهمة متكررة</label>
          {repeat && <>
            <div className="flex flex-wrap gap-2">{["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((label, index) =>
              <label key={label} className="flex items-center gap-1 rounded-md border p-2 text-xs">
                <input type="checkbox" checked={weekdays.includes(index)} onChange={event => {
                  const checked = event.target.checked;
                  setWeekdays(previous => checked ? [...previous, index] : previous.filter(day => day !== index));
                }} />{label}
              </label>)}</div>
            <label className="flex items-center gap-2 text-sm">عدد الأسابيع <Input type="number" className="w-20" min={1} max={52} value={weeks} onChange={event => setWeeks(Number(event.target.value))} required /></label>
            <p className="text-xs text-muted-foreground">هيتعمل سجل منفصل في كل يوم اخترته بدايةً من التاريخ المجدول.</p>
          </>}
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={pending}>إلغاء</Button><Button type="submit" disabled={!title.trim() || pending || (repeat && !weekdays.length)}>حفظ المهمة</Button></DialogFooter>
      </form> : task && <>
        <div className="flex flex-wrap gap-2">
          <Badge className={priorities[task.priority].tone}>{priorities[task.priority].label}</Badge>
          <Badge variant="secondary">{task.status === "completed" ? "مكتملة" : "قيد التنفيذ"}</Badge>
        </div>
        {task.description && <p className="whitespace-pre-wrap text-sm">{task.description}</p>}
        <dl className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div><dt className="inline font-semibold">اليوم المجدول: </dt><dd className="inline">{task.scheduledFor ? new Date(task.scheduledFor + "T12:00:00").toLocaleDateString("ar-EG") : "غير مجدولة"}</dd></div>
          {task.deadline && <div><dt className="inline font-semibold">آخر موعد: </dt><dd className="inline">{new Date(task.deadline).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}</dd></div>}
          <div><dt className="inline font-semibold">التصنيف: </dt><dd className="inline">{task.category}</dd></div>
        </dl>
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => void moveToTrash()}>نقل للسلة</Button>
          <Button variant="outline" onClick={() => setEditing(true)}><Pencil />تعديل المهمة</Button>
          {task.status !== "completed" && <>
            <Button variant="outline" disabled={pending} onClick={() => void postpone()}>أجّل يوم</Button>
            <Button disabled={pending} onClick={() => void finish()}><CheckCircle2 />إكمال</Button>
          </>}
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
