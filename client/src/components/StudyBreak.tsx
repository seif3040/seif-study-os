import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { notifyStudy } from "@/lib/studyAlerts";
import { errorText } from "@/lib/study";
import { toast } from "sonner";

function elapsedLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return [hours, minutes, seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
}

export default function StudyBreak() {
  const utils = trpc.useUtils();
  const { data: active, isPending } = trpc.planner.studyBreak.useQuery();
  const owner = trpc.auth.me.useQuery().data?.id;
  const [minutes, setMinutes] = useState(5);
  const change = trpc.planner.setStudyBreak.useMutation({
    onSuccess: () => Promise.all([
      utils.planner.studyBreak.invalidate(),
      utils.pomodoro.list.invalidate(),
      utils.video.current.invalidate(),
      utils.video.open.invalidate(),
      utils.analytics.overview.invalidate(),
    ]),
    onError: error => toast.error(errorText(error)),
  });
  return <section className="surface flex flex-wrap items-center justify-between gap-3 p-4">
    <h2 className="flex items-center gap-2 font-bold"><Coffee className="size-5 text-primary" />استراحة المذاكرة</h2>
    {active ? <BreakClock {...active} owner={owner} /> : <label className="flex items-center gap-2 text-sm">
      التنبيه بعد <Input className="w-20" type="number" min={1} max={120} value={minutes} onChange={event => setMinutes(event.target.valueAsNumber || 0)} /> دقيقة
    </label>}
    {active ? <Button disabled={change.isPending} onClick={() => change.mutate({})}>إنهاء البريك</Button>
      : <Button variant="outline" disabled={isPending || change.isPending || !Number.isInteger(minutes) || minutes < 1 || minutes > 120}
          onClick={() => change.mutate({ minutes })}>ابدأ بريك</Button>}
  </section>;
}

function BreakClock({ startedAt, targetAt, owner }: { startedAt: number; targetAt: number; owner?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = targetAt - now;
  const targetReached = remaining <= 0;
  useEffect(() => {
    if (owner && targetReached && Date.now() - targetAt < 90_000) {
      notifyStudy("وقت البريك المحدد خلص. التسجيل مستمر لحد ما ترجع.", "timer", owner + ":study-break:" + startedAt);
    }
  }, [owner, targetReached, startedAt, targetAt]);
  return <div className="text-sm">
    <span>وقت الراحة الفعلي </span><b dir="ltr" className="font-mono">{elapsedLabel(Math.max(0, Math.floor((now - startedAt) / 1000)))}</b>
    <p className="text-muted-foreground">{targetReached ? "وقت التنبيه عدى. البريك لسه بيتسجل." : "التنبيه بعد " + elapsedLabel(Math.ceil(remaining / 1000))}</p>
  </div>;
}
