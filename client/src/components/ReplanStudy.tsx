import { useState } from "react";
import { toast } from "sonner";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { formatClock } from "@shared/clockFormat";
import { plannerToday } from "@shared/studyPlanner";

export function ReplanStudy({ day }: { day: string }) {
  const [open, setOpen] = useState(false);
  const preview = trpc.planner.previewReplan.useQuery(undefined, { enabled: open, staleTime: 0 });
  const utils = trpc.useUtils();
  const apply = trpc.planner.applyReplan.useMutation({ onSuccess: async () => {
    await utils.planner.list.invalidate();
    setOpen(false);
    toast.success("خطة المذاكرة اتعدّلت.");
  }, onError: e => { toast.error(errorText(e)); void preview.refetch(); } });
  if (day !== plannerToday()) return null;
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>ظبّط باقي اليوم</Button>
    {open && <ActionDialog title="ظبّط باقي اليوم" pending={apply.isPending} onClose={() => setOpen(false)}>
      <p className="text-sm text-muted-foreground">لو وقت مذاكرة فات، هنقترح أقرب فراغ النهارده أو يوم الدراسة اللي بعده، بأولوية للدروس اللي امتحانها أقرب.</p>
      {preview.isFetching ? <p>بحسب الوقت المتاح…</p> : preview.isError
        ? <Button variant="outline" onClick={() => void preview.refetch()}>جرّب تاني</Button>
        : <div className="space-y-3">
          {preview.data?.changes.map(item => <p key={item.id} className="rounded-lg border p-3 text-sm">
            <strong>{item.title}</strong> · {item.day === day ? "النهارده" : item.day} · {formatClock(item.start)} – {formatClock(item.end)}
          </p>)}
          {!!preview.data?.left.length && <p className="text-sm text-muted-foreground">مفيش فراغ مناسب لـ {preview.data.left.join("، ")}. ممكن تأجلهم يدويًا من الجدول.</p>}
          {preview.data?.changes.length
            ? <Button disabled={apply.isPending} onClick={() => apply.mutate(preview.data!.changes.map(({ id, day, start, end }) => ({ id, day, start, end })))}>اعتمد التعديل</Button>
            : <p className="text-sm">مفيش مواعيد قابلة للنقل حاليًا.</p>}
        </div>}
    </ActionDialog>}
  </>;
}
