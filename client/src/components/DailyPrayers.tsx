import { nawafil, prayerLoggingEnd } from "@shared/nawafil";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Check, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { formatClock } from "@shared/clockFormat";

export default function DailyPrayers({ day }: { day: string }) {
  const [confirm, setConfirm] = useState<"Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha">();
  const cairoClock = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [now, setNow] = useState(cairoClock);
  useEffect(() => { const timer = window.setInterval(() => setNow(cairoClock()), 1000); return () => window.clearInterval(timer); }, []);
  const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const query = trpc.prayers.today.useQuery(undefined, { refetchInterval: 60_000 });
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.planner.list.invalidate(), utils.prayers.today.invalidate(), utils.coins.ledger.invalidate(), utils.dashboard.summary.invalidate()]);
  const planner = trpc.planner.list.useQuery();
  const naf = trpc.prayers.setNafl.useMutation({
    onSuccess: async result => {
      await refresh();
      if (result.amount) toast.success("اتضافت نقاط الصلاة: " + result.amount);
    },
    onError: error => toast.error(errorText(error)),
  });
  const dhuhr = query.data?.prayers.find(item => item.prayer === "Dhuhr")?.time;
  const log = trpc.prayers.log.useMutation({
    onSuccess: async result => {
      setConfirm(undefined);
      await refresh();
      toast.success(result.amount ? "اتضافت نقاط الصلاة: " + result.amount : "اتسجّل الفرض. النقاط بعد إكمال الفروض والنوافل.");
    },
    onError: error => toast.error(errorText(error)),
  });
  return <section className="surface space-y-3 p-5">
    <h2 className="flex items-center gap-2 font-bold"><Clock3 className="size-5" /> مواقيت الصلاة · القاهرة</h2>
    <p className="text-sm text-muted-foreground">الفجر يتسجّل بالنقاط لحد أذان الظهر. باقي الصلوات خلال ساعة من الأذان.</p>
    <p className="text-sm font-semibold">{query.data?.awarded ? "نقاط صلاة اليوم اتحسبت." : "٢٥٠٠ نقطة بعد تسجيل الفروض الخمسة في مواعيدها وتأكيد كل النوافل."}</p>
    {query.isError && <p role="alert">تعذّر تحميل الصلوات. <Button size="sm" variant="outline" onClick={() => void query.refetch()}>جرّب تاني</Button></p>}
    {query.isLoading && <p>جارٍ تحميل المواقيت…</p>}
    {query.data?.day === day && <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {query.data.prayers.map(item => {
        const start = item.time ? minute(item.time) : null;
        const end = start !== null && dhuhr ? prayerLoggingEnd(item.prayer, start, minute(dhuhr)) : null;
        const canLog = start !== null && end !== null && minute(now) >= start && minute(now) < end;
        return <li key={item.prayer} className="space-y-2 rounded-xl border p-3">
        <p className="font-bold">{item.name}</p>
        <p className="text-sm text-muted-foreground">{item.time && end !== null ? formatClock(item.time) + " – " + formatClock(end) : "الموعد غير متاح"}</p>
        <Button size="sm" variant={item.done ? "secondary" : "outline"} disabled={item.done || log.isPending || !canLog}
          onClick={() => setConfirm(item.prayer)}><Check />{item.done ? "اتسجّلت" : canLog ? "سجّل الصلاة" : end !== null && minute(now) >= end ? "انتهى وقت النقاط" : "لسه معادها مجاش"}</Button>
      </li>;
      })}
    </ul>}
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer font-bold">النوافل والسنن</summary>
      <p className="mt-2 text-sm text-muted-foreground">علّم على النافلة بعد ما تصليها في وقتها.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {nawafil.map(name => <label key={name} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={planner.data?.nawafilByDay?.[day]?.includes(name) ?? false}
            disabled={!planner.data || naf.isPending || query.data?.awarded} onChange={event => naf.mutate({ day, name, done: event.target.checked })} />
          {name}
        </label>)}
      </div>
    </details>
    <Dialog open={Boolean(confirm)} onOpenChange={open => { if (!open && !log.isPending) setConfirm(undefined); }}>
      <DialogContent dir="rtl">
        <DialogTitle>تأكيد الصلاة</DialogTitle>
        <DialogDescription>{confirm === "Fajr" ? "صلّيت الفجر في البيت؟" : "نزلت وصلّيت الصلاة دي في الجامع؟"}</DialogDescription>
        <div className="flex gap-2">
          <Button disabled={log.isPending} onClick={() => confirm && log.mutate({ day, prayer: confirm, location: confirm === "Fajr" ? "home" : "mosque" })}>أيوه، سجّل الصلاة</Button>
          <Button variant="outline" disabled={log.isPending} onClick={() => setConfirm(undefined)}>لأ</Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
