import { Check, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { formatClock } from "@shared/clockFormat";

export default function DailyPrayers({ day }: { day: string }) {
  const query = trpc.prayers.today.useQuery(undefined, { refetchInterval: 60_000 });
  const utils = trpc.useUtils();
  const log = trpc.prayers.log.useMutation({
    onSuccess: async result => {
      await Promise.all([utils.prayers.today.invalidate(), utils.coins.ledger.invalidate(), utils.dashboard.summary.invalidate()]);
      if (result.awarded) toast.success("اتسجّلت الصلاة · +٥٠٠ نقطة");
    },
    onError: error => toast.error(errorText(error)),
  });
  return <section className="surface space-y-3 p-5">
    <h2 className="flex items-center gap-2 font-bold"><Clock3 className="size-5" /> مواقيت الصلاة · القاهرة</h2>
    {query.isError && <p role="alert">تعذّر تحميل الصلوات. <Button size="sm" variant="outline" onClick={() => void query.refetch()}>جرّب تاني</Button></p>}
    {query.isLoading && <p>جارٍ تحميل المواقيت…</p>}
    {query.data?.day === day && <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {query.data.prayers.map(item => <li key={item.prayer} className="space-y-2 rounded-xl border p-3">
        <p className="font-bold">{item.name}</p>
        <p className="text-sm text-muted-foreground">{item.time ? formatClock(item.time) : "الموعد غير متاح"}</p>
        <Button size="sm" variant={item.done ? "secondary" : "outline"} disabled={item.done || log.isPending}
          onClick={() => log.mutate({ day, prayer: item.prayer })}><Check />{item.done ? "اتسجّلت" : "صلّيت · +٥٠٠"}</Button>
      </li>)}
    </ul>}
  </section>;
}
