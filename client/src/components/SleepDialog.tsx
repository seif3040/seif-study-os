import { useState } from "react";
import { MoonStar } from "lucide-react";
import { toast } from "sonner";
import { sleepDuration, type SleepLog } from "@shared/sleep";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorText, minutesLabel } from "@/lib/study";
import { trpc } from "@/lib/trpc";

export default function SleepDialog({ day, initial, onClose }: { day: string; initial?: SleepLog; onClose(): void }) {
  const [bed, setBed] = useState(initial?.bed ?? "");
  const [wake, setWake] = useState(initial?.wake ?? "");
  const duration = bed && wake ? sleepDuration({ bed, wake }) : 0;
  const valid = duration > 0 && duration < 1200;
  const utils = trpc.useUtils();
  const save = trpc.planner.logSleep.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planner.list.invalidate(), utils.analytics.overview.invalidate()]);
      onClose();
      toast.success("اتسجّل نومك النهارده.");
    },
    onError: error => toast.error(errorText(error)),
  });

  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent dir="rtl" className="space-y-2">
      <DialogTitle className="flex items-center gap-2"><MoonStar className="size-5 text-primary" />نمت وصحيت الساعة كام؟</DialogTitle>
      <DialogDescription>سجّل نوم الليلة اللي فاتت عشان تشوفه جنب مذاكرة النهارده.</DialogDescription>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (valid) save.mutate({ day, bed, wake }); }}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">نمت الساعة<Input type="time" required value={bed} onChange={event => setBed(event.target.value)} /></label>
          <label className="block space-y-1">صحيت الساعة<Input type="time" required value={wake} onChange={event => setWake(event.target.value)} /></label>
        </div>
        {valid && <p className="rounded-lg bg-primary/10 p-3 text-sm font-semibold">مدة النوم · {minutesLabel(duration)}</p>}
        <div className="flex gap-2">
          <Button disabled={!valid || save.isPending}>احفظ نوم النهارده</Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{initial ? "إلغاء" : "هسجّل بعدين"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
