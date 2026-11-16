import { plannerToday, plannerWeekday } from "@shared/studyPlanner";
import SleepDialog from "@/components/SleepDialog";
import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";
import DailyStudyPrompt from "@/components/DailyStudyPrompt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";

type Entries = inferRouterOutputs<AppRouter>["planner"]["hybridHomeworkReview"];
const dateLabel = new Intl.DateTimeFormat("ar-EG", { dateStyle: "full", timeZone: "UTC" });

export default function StudyPrompts() {
  const review = trpc.planner.hybridHomeworkReview.useQuery();
  const planner = trpc.planner.list.useQuery();
  const [day, setDay] = useState(plannerToday);
  const [dismissed, setDismissed] = useState<string>();
  useEffect(() => {
    const refreshDay = () => setDay(plannerToday());
    window.addEventListener("focus", refreshDay);
    return () => window.removeEventListener("focus", refreshDay);
  }, []);
  if (review.isLoading) return null;
  if (review.data?.length) return <HybridHomeworkReview entries={review.data} />;
  if (planner.data && !planner.data.sleepLogs?.[day] && dismissed !== day) return <SleepDialog day={day} onClose={() => setDismissed(day)} />;
  return plannerWeekday(day) === 5 ? null : <DailyStudyPrompt />;
}

function HybridHomeworkReview({ entries }: { entries: Entries }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const utils = trpc.useUtils();
  const groups = new Map<string, Entries>();
  for (const entry of entries) {
    const items = groups.get(entry.subject) ?? [];
    items.push(entry);
    groups.set(entry.subject, items);
  }
  const subjects = Array.from(groups.entries());
  const index = Math.min(step, subjects.length - 1);
  const [subject, items] = subjects[index];
  const allAnswered = entries.every(entry => answers[entry.key] !== undefined);
  const nextReady = items.every(entry => answers[entry.key] !== undefined);
  const last = index === subjects.length - 1;
  const finish = trpc.planner.finishHybridHomeworkReview.useMutation({
    onSuccess: async () => {
      utils.planner.hybridHomeworkReview.setData(undefined, []);
      await utils.invalidate();
      toast.success("اتحفظت إجاباتك واتضافت المحاضرات اللي لسه عليك.");
    },
    onError: error => toast.error(errorText(error)),
  });

  return <Dialog open>
    <DialogContent dir="rtl" showCloseButton={false} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
      onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>شوفت محاضرات الأونلاين اللي فاتتك؟</DialogTitle>
      <DialogDescription>راجع الحصص اللي سجلت حضورها قبل التحديث. اللي لسه ما شوفتوش هيتضاف للواجبات.</DialogDescription>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-3">
        <h3 className="font-bold">{subject}</h3><span className="text-sm">{index + 1} من {subjects.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map(item => <li key={item.key} className="space-y-2 rounded-lg border p-3">
          <p className="font-medium">{item.lessonTitles.join("، ")}</p>
          <p className="text-sm text-muted-foreground">{item.source.teacherName} · {dateLabel.format(new Date(item.day))}</p>
          <div className="flex flex-wrap gap-2">
            {[true, false].map(watched => <Button key={String(watched)} size="sm"
              variant={answers[item.key] === watched ? "default" : "outline"} aria-pressed={answers[item.key] === watched}
              disabled={finish.isPending} onClick={() => setAnswers(previous => ({ ...previous, [item.key]: watched }))}>
              {watched ? "شوفتها" : "لسه ما شوفتهاش"}
            </Button>)}
          </div>
        </li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        {index > 0 && <Button variant="outline" disabled={finish.isPending} onClick={() => setStep(index - 1)}>المادة اللي قبلها</Button>}
        {last ? <Button disabled={!allAnswered || finish.isPending}
          onClick={() => finish.mutate(entries.map(({ key }) => ({ key, watched: answers[key] })))}>احفظ الإجابات</Button>
          : <Button disabled={!nextReady} onClick={() => setStep(index + 1)}>المادة اللي بعدها</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
