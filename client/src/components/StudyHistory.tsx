import ActionDialog from "@/components/ActionDialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { errorText } from "@/lib/study";

export default function StudyHistory() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const planner = trpc.planner.list.useQuery();
  const undo = trpc.planner.undoStudyChange.useMutation({
    onSuccess: async () => { await utils.invalidate(); toast.success("رجّعنا آخر تعديل في الجدول."); },
    onError: error => toast.error(errorText(error)),
  });
  const dates = new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Cairo" });
  return <div className="mb-3">
    <Button variant="outline" onClick={() => setOpen(true)}>سجل تعديلات الجدول</Button>
    {open && <ActionDialog title="سجل تعديلات الجدول" pending={undo.isPending} onClose={() => setOpen(false)}>
      {planner.data?.studyHistory?.length ? <ol className="max-h-[45vh] space-y-2 overflow-auto">
        {planner.data.studyHistory.map((entry, index) => <li key={entry.at + ":" + index} className="rounded-lg border p-3 text-sm">
          <time>{dates.format(entry.at)}</time>
          {entry.reverted && <span> · تم التراجع</span>}
          <ul className="my-1 space-y-1">{entry.changes.map(change => <li key={change.id}>
            {change.after?.done ? "إكمال" : !change.before ? "إضافة" : !change.after ? "حذف" : "تعديل"} · {change.after?.title ?? change.before?.title}
            {change.before && <span> · {change.before.day} {change.before.start}</span>}
            {change.after && <span> ← {change.after.day} {change.after.start}</span>}
          </li>)}</ul>
          {index === 0 && !entry.reverted && entry.changes.every(change => Boolean(change.before?.done) === Boolean(change.after?.done)) &&
            <Button size="sm" variant="outline" disabled={undo.isPending} onClick={() => undo.mutate({ at: entry.at })}>اتراجع عن آخر تعديل</Button>}
        </li>)}
      </ol> : <p>التعديلات الجديدة هتظهر هنا.</p>}
    </ActionDialog>}
  </div>;
}
