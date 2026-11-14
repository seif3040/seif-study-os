import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { plannerToday } from "@shared/studyPlanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { formatClock } from "@shared/clockFormat";
import { toast } from "sonner";

export default function DailyStudyPrompt() {
  const [day, setDay] = useState(plannerToday);
  useEffect(() => {
    const refreshDay = () => setDay(plannerToday());
    const timer = window.setInterval(refreshDay, 15_000);
    window.addEventListener("focus", refreshDay);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDay);
    };
  }, []);
  return <DailyStudyDialog key={day} day={day} />;
}

function DailyStudyDialog({ day }: { day: string }) {
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const [count, setCount] = useState(2);
  const [reserve, setReserve] = useState(60);
  const [budget, setBudget] = useState(120);
  const [subjectId, setSubject] = useState<number>();
  const [exclude, setExclude] = useState<number[]>([]);
  const input = { count, reserve, budget, subjectId, exclude };
  const answered = planner.data?.dailyPrompt?.day === day;
  const valid = Number.isInteger(count) && count >= 1 && count <= 20 && reserve >= 0 && reserve <= 1440 && budget >= 5 && budget <= 1440;
  const eligibility = trpc.planner.previewDaily.useQuery(
    { count: 1, reserve: 60, budget: 1440, exclude: [] },
    { enabled: Boolean(planner.data?.backlog?.length) && !answered, refetchInterval: 60_000 },
  );
  const eligible = !eligibility.isError && eligibility.data?.day === day && eligibility.data.suggestions.length > 0;
  const preview = trpc.planner.previewDaily.useQuery(input, { enabled: eligible && valid });
  const approve = trpc.planner.approveDaily.useMutation({
    onSuccess: async () => { await utils.planner.list.invalidate(); toast.success("خطة النهارده اتعمدت."); },
    onError: error => { toast.error(errorText(error)); void preview.refetch(); },
  });
  const skip = trpc.planner.skipDaily.useMutation({
    onSuccess: () => utils.planner.list.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  if (answered || !eligible) return null;
  const data = preview.data;
  return <Dialog open>
    <DialogContent dir="rtl" showCloseButton={false}
      className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto"
      onEscapeKeyDown={event => event.preventDefault()}
      onInteractOutside={event => event.preventDefault()}>
      <DialogTitle>هتذاكر إيه من المتراكم النهارده؟</DialogTitle>
      <DialogDescription>اعتمد خطة اليوم أو اختار «مش النهارده» عشان تكمل.</DialogDescription>
      <div className="space-y-3">
    {data && <p>متاح {Math.floor(data.available / 60)} ساعة و{data.available % 60} دقيقة بعد المواعيد المحجوزة.</p>}
    <div className="grid gap-2 sm:grid-cols-3">
      <label>عدد الدروس<Input type="number" min={1} max={20} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <label>دقائق المذاكرة بحد أقصى<Input type="number" min={5} max={1440} value={budget} onChange={e => setBudget(Number(e.target.value))} /></label>
      <label>دقائق تسيبها للأكل والراحة<Input type="number" min={0} max={1440} value={reserve} onChange={e => setReserve(Number(e.target.value))} /></label>
    </div>
    <label className="block">المواد
      <select className="ms-2 rounded-md border bg-background p-2" value={subjectId ?? ""} onChange={e => { setSubject(Number(e.target.value) || undefined); setExclude([]); }}>
        <option value="">اقترح مزيج من المواد</option>
        {data?.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.title} · {subject.count} متراكم</option>)}
      </select>
    </label>
    {preview.isFetching && <p>بحسب الوقت والدروس…</p>}
    {preview.isError && <p role="alert">تعذّر تحميل الاقتراح. <Button size="sm" variant="outline" onClick={() => void preview.refetch()}>جرّب تاني</Button></p>}
    {data && !data.suggestions.length && <p>{data.subjects.length ? "مفيش درس مناسب للوقت والاختيارات دي." : "مفيش دروس متراكمة جاهزة للجدولة."}</p>}
    {data?.suggestions.map(item => <div key={item.lessonId} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <div className="flex-1"><p className="font-bold">{item.subject} · {item.title}</p>
        <p className="text-sm">{formatClock(item.start)} – {formatClock(item.end)} · {item.reason}</p></div>
      <Button size="sm" variant="ghost" onClick={() => setExclude(ids => [...ids, item.lessonId].slice(-200))}>بدّل الدرس</Button>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!valid || !data?.suggestions.length || preview.isFetching || approve.isPending || skip.isPending}
        onClick={() => data && approve.mutate({ ...input, day: data.day, expected: data.suggestions.map(({ lessonId, start, end }) => ({ lessonId, start, end })) })}>اعتمد خطة اليوم</Button>
      <Button variant="outline" disabled={approve.isPending || skip.isPending} onClick={() => skip.mutate()}>مش النهارده</Button>
      {exclude.length > 0 && <Button variant="ghost" onClick={() => setExclude([])}>رجّع الدروس المستبعدة</Button>}
    </div>
      </div>
    </DialogContent>
  </Dialog>;
}
