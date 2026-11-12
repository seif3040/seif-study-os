import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, minutesLabel, shortDate } from "@/lib/study";
import { trpc } from "@/lib/trpc";

export default function FocusAssignments({ subjects }: { subjects: [number, string][] }) {
  const assignments = trpc.pomodoro.assignments.useQuery();
  const assign = trpc.pomodoro.assignSubject.useMutation();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<number[]>([]);
  const [subject, setSubject] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [count, setCount] = useState(10);
  const [visibleCount, setVisibleCount] = useState(24);
  const all = assignments.data ?? [];
  const unassigned = all.filter(row => row.subjectId === null);
  const rows = onlyUnassigned ? unassigned : all;
  const selectedRows = all.filter(row => selected.includes(row.id));
  const total = selectedRows.reduce((minutes, row) => minutes + (row.minutes ?? 0), 0);
  const titles = new Map(subjects);

  async function save() {
    try {
      const result = await assign.mutateAsync({ eventIds: selected, subjectId: subject ? Number(subject) : null });
      setSelected([]);
      toast.success("اتحدّث تخصيص " + result.updated + " سجل تركيز");
      await Promise.all([utils.pomodoro.invalidate(), utils.analytics.invalidate()]);
    } catch (error) { toast.error(errorText(error)); }
  }

  return <section className="surface mt-5 space-y-4 p-5">
    <header><h2 className="font-bold">توزيع وقت التركيز على المواد</h2><p className="mt-1 text-sm text-muted-foreground">متبقي {minutesLabel(unassigned.reduce((minutes, row) => minutes + (row.minutes ?? 0), 0))} من غير مادة. السجلات مترتبة من الأقدم للأحدث.</p></header>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnassigned} onChange={event => { setOnlyUnassigned(event.target.checked); setVisibleCount(24); }} />من غير مادة فقط</label>
      <Input className="w-20" type="number" min={1} max={400} aria-label="عدد السجلات الأقدم" value={count} onChange={event => setCount(Number(event.target.value))} />
      <Button variant="outline" size="sm" disabled={!unassigned.length || !Number.isInteger(count) || count < 1 || count > 400} onClick={() => {
        setOnlyUnassigned(true);
        setSelected(unassigned.slice(0, count).map(row => row.id));
      }}>اختار أقدم سجلات من غير مادة</Button>
    </div>
    {assignments.isLoading ? <p>جارٍ التحميل…</p> : assignments.isError ? <p>تعذّر تحميل سجل التركيز.</p> : rows.length ? <>
      <ul className="max-h-72 divide-y overflow-auto rounded-xl border">
        {rows.slice(0, visibleCount).map(row => <li key={row.id}>
          <label className="flex cursor-pointer flex-wrap items-center gap-3 p-3 text-sm">
            <input type="checkbox" checked={selected.includes(row.id)} disabled={assign.isPending || (!selected.includes(row.id) && selected.length >= 400)} onChange={event => {
              const checked = event.target.checked;
              setSelected(previous => checked ? [...previous, row.id] : previous.filter(id => id !== row.id));
            }} />
            <span>{shortDate.format(new Date(row.date))}</span>
            <b>{minutesLabel(row.minutes ?? 0)}</b>
            <span className="ms-auto text-muted-foreground">{row.subjectId ? titles.get(row.subjectId) ?? "مادة محذوفة" : "من غير مادة"}</span>
          </label>
        </li>)}
      </ul>
      {rows.length > visibleCount && <Button variant="ghost" size="sm" onClick={() => setVisibleCount(value => value + 24)}>عرض سجلات أكتر</Button>}
    </> : <p className="text-sm text-muted-foreground">مفيش سجلات في العرض ده.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="المادة الجديدة" value={subject} onChange={event => setSubject(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-sm">
        <option value="">من غير مادة</option>{subjects.map(([id, title]) => <option value={id} key={id}>{title}</option>)}
      </select>
      <Button disabled={!selected.length || assign.isPending} onClick={() => void save()}>حفظ تخصيص {minutesLabel(total)}</Button>
      {selected.length > 0 && <Button variant="ghost" onClick={() => setSelected([])}>إلغاء التحديد</Button>}
    </div>
  </section>;
}
