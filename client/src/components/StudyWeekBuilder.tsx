import { useState } from "react";
import { toast } from "sonner";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";

export default function StudyWeekBuilder() {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(6);
  const [budget, setBudget] = useState<number>();
  const utils = trpc.useUtils();
  const preview = trpc.planner.previewWeek.useQuery({ budget: budget ?? 30 }, { enabled: open && budget !== undefined });
  const apply = trpc.planner.applyWeek.useMutation({
    onSuccess: async result => {
      await utils.invalidate();
      toast.success("اتضاف " + result.added + " موعد في جدولك.");
      setBudget(undefined);
      setOpen(false);
    },
    onError: error => { toast.error(errorText(error)); void preview.refetch(); },
  });
  return <div className="mb-3">
    <Button variant="outline" onClick={() => { setBudget(undefined); setOpen(true); }}>وزّع ساعات الأسبوع</Button>
    {open && <ActionDialog title="وزّع ساعات الأسبوع" pending={apply.isPending} onClose={() => setOpen(false)}>
      <p className="text-sm text-muted-foreground">الخطة بتغطي السبع أيام الجاية وبتسيب الجمعة إجازة. الأولوية لمواعيد الامتحانات والواجبات، وبعدها الجديد والمتراكم بالتبادل. الواجب له ٢٥ دقيقة تقديريًا.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault();
        const next = Math.round(hours * 60);
        if (next === budget) void preview.refetch();
        else setBudget(next);
      }}>
        <label className="text-sm">الساعات الإضافية
          <input className="block w-28 rounded-md border bg-background p-2" type="number" required min={0.5} max={40} step={0.5} value={hours}
            disabled={apply.isPending} onChange={event => { setHours(event.target.valueAsNumber || 0); setBudget(undefined); }} />
        </label>
        <Button variant="outline" disabled={apply.isPending}>عاين الخطة</Button>
      </form>
      {budget !== undefined && (preview.isFetching ? <p role="status">بنحسب الوقت المتاح…</p> : preview.isError ? <p role="alert">{errorText(preview.error)}</p> : preview.data && <>
        {preview.data.entries.length ? <ul className="max-h-64 space-y-2 overflow-auto">
          {[...preview.data.entries].sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start)).map(item => <li key={item.day + item.start} className="rounded-lg border p-2 text-sm">
            <strong>{item.title}</strong> · {item.kind === "homework" ? "واجب" : item.kind === "review" ? "مراجعة" : item.kind === "backlog" ? "متراكم" : "مذاكرة"} · {item.day} · {formatClock(item.start)}–{formatClock(item.end)}
          </li>)}
        </ul> : <p>مفيش درس أو واجب مناسب في المواعيد المتاحة.</p>}
        {preview.data.remaining > 0 && <p className="text-sm">فاضل {preview.data.remaining} دقيقة من الوقت اللي حددته.</p>}
        <Button disabled={!preview.data.entries.length || apply.isPending} onClick={() => apply.mutate({ budget, signature: JSON.stringify(preview.data.entries) })}>اعتمد الخطة</Button>
      </>)}
    </ActionDialog>}
  </div>;
}
