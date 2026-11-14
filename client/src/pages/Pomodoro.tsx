import { FloatingFocus } from "@/components/FloatingFocus";
import { focusReward, isFocusPreset } from "@shared/focusDuration";
import { Input } from "@/components/ui/input";
import { useEffect, useState, type CSSProperties } from "react";
import FocusAssignments from "@/components/FocusAssignments";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { errorText, money, minutesLabel } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { Coffee, Pause, Play, RotateCcw, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";

type RoundPlan = { minutes: number; rest: number; rounds: number; round: number; subjectId?: number; sessionId: number };
const presets = [15, 25, 45, 60] as const;
export default function Pomodoro({ embedded = false }: { embedded?: boolean }) { const utils = trpc.useUtils(); const { data: rates } = trpc.economy.rates.useQuery(); const { data, isLoading } = trpc.pomodoro.list.useQuery(); const active = data?.find(session => session.state === "running" || session.state === "paused"); const plan = trpc.studyPlan.list.useQuery(); const subjects = Array.from(new Map(plan.data?.rows.map(row => [row.subject.id, row.subject.title])).entries()); const [subject, setSubject] = useState(""); const [showHistory, setShowHistory] = useState(false); const history = data?.filter(session => session.state === "completed") ?? []; const [now, setNow] = useState(Date.now()); const [selected, setSelected] = useState(25);
const [mode, setMode] = useState<"quick" | "custom">("quick");
const [hours, setHours] = useState(1);
const [minutes, setMinutes] = useState(30);
const [rest, setRest] = useState(10);
const [rounds, setRounds] = useState(2);
const owner = trpc.auth.me.useQuery().data?.id;
const key = owner ? "study-focus-plan:" + owner : undefined;
const [storedPlan, setStoredPlan] = useState<{ key: string; plan?: RoundPlan }>();
const routine = storedPlan?.key === key ? storedPlan?.plan : undefined;
useEffect(() => {
  if (!key) return;
  try {
    const value = localStorage.getItem(key);
    setStoredPlan({ key, plan: value ? JSON.parse(value) : undefined });
  } catch { setStoredPlan({ key }); }
}, [key]);
function setRoutine(plan?: RoundPlan) {
  if (!key) return;
  setStoredPlan({ key, plan });
  try {
    if (plan) localStorage.setItem(key, JSON.stringify(plan));
    else localStorage.removeItem(key);
  } catch { /* Session timer still works. */ }
}
const [startingRoutine, setStartingRoutine] = useState<Omit<RoundPlan, "sessionId">>();
const customMinutes = hours * 60 + minutes;
const valid = [hours, minutes, rest, rounds].every(Number.isInteger) && hours >= 0 && minutes >= 0 && minutes < 60
  && customMinutes >= 5 && customMinutes <= 720 && rest >= 0 && rest <= 120 && rounds >= 1 && rounds <= 12;
const rateKey = isFocusPreset(customMinutes) ? "pomodoro_" + customMinutes : "pomodoro_60";
const reward = focusReward(customMinutes, rates?.find(rate => rate.key === rateKey)?.amount ?? 0);
const finishedRound = history.find(item => item.id === routine?.sessionId);
const breakRemaining = routine && finishedRound?.completedAt
  ? Math.max(0, Math.ceil((+new Date(finishedRound.completedAt) + routine.rest * 60_000 - now) / 1000)) : 0;
 useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); const elapsed = active ? Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000) - active.pausedSeconds - (active.state === "paused" && active.pausedAt ? Math.floor((now - new Date(active.pausedAt).getTime()) / 1000) : 0)) : 0; const remaining = active ? Math.max(0, active.plannedMinutes * 60 - elapsed) : (mode === "custom" && valid ? customMinutes : selected) * 60; const progress = active ? Math.min(100, elapsed * 100 / (active.plannedMinutes * 60)) : 0; const pretty = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`; const invalidate = () => Promise.all([utils.pomodoro.list.invalidate(), utils.dashboard.summary.invalidate(), utils.analytics.overview.invalidate(), utils.coins.ledger.invalidate()]); const start = trpc.pomodoro.start.useMutation({ onSuccess: async session => {
  if (startingRoutine && session) setRoutine({ ...startingRoutine, sessionId: session.id });
  setStartingRoutine(undefined);
  toast.success("بدأت جلسة التركيز.");
  await invalidate();
}, onError: e => { setStartingRoutine(undefined); toast.error(errorText(e)); } }); const pause = trpc.pomodoro.setPaused.useMutation({ onSuccess: invalidate, onError: e => toast.error(errorText(e)) }); const complete = trpc.pomodoro.complete.useMutation({ onSuccess: async r => { toast.success("amount" in r && r.amount ? `اكتملت الجلسة: +${money.format(r.amount)} Coins` : "اكتملت الجلسة."); (r.unlocks ?? []).forEach((x: any) => toast.success(`🏆 تم فتح: ${x.title}`)); await invalidate(); }, onError: e => toast.error(errorText(e)) }); useEffect(() => { if (active?.state === "running" && remaining === 0 && !complete.isPending) complete.mutate({ sessionId: active.id }); }, [remaining, active?.id, active?.state]);
  const betweenRounds = !active && routine && finishedRound && routine.round < routine.rounds;
  function startNextRound() {
    if (!routine || !betweenRounds || breakRemaining > 0 || start.isPending) return;
      setStartingRoutine({ ...routine, round: routine.round + 1 });
      start.mutate({ plannedMinutes: routine.minutes, subjectId: routine.subjectId });
  }
  function startFocus() {
    if (active || !data || start.isPending || (mode === "custom" && !valid)) return;
        const subjectId = subject ? Number(subject) : undefined;
        setRoutine(undefined);
        if (mode === "custom") setStartingRoutine({ minutes: customMinutes, rest, rounds, round: 1, subjectId });
        start.mutate({ plannedMinutes: mode === "custom" ? customMinutes : selected, subjectId });
  }
  const floatingStatus = active
    ? active.state === "paused" ? "متوقف مؤقتًا" : "تركيز"
    : betweenRounds ? breakRemaining > 0 ? "بريك" : "جاهز للجولة الجاية"
      : mode === "custom" && !valid ? "راجع إعدادات الخطة في الصفحة" : "جاهز للبدء";
  const floatingAction = active
    ? remaining === 0 && active.state === "running"
      ? { label: "سجّل الإكمال", disabled: complete.isPending, run: () => complete.mutate({ sessionId: active.id }) }
      : { label: active.state === "paused" ? "استئناف" : "إيقاف مؤقت", disabled: pause.isPending,
          run: () => pause.mutate({ sessionId: active.id, paused: active.state === "running" }) }
    : betweenRounds
      ? { label: "ابدأ الجولة الجاية", disabled: breakRemaining > 0 || start.isPending, run: startNextRound }
      : { label: "ابدأ التركيز", disabled: !data || start.isPending || (mode === "custom" && !valid), run: startFocus };
 if (isLoading) return <div className="h-80 animate-pulse rounded-2xl bg-muted" />; return <div>{!embedded && <PageHeader title="Pomodoro" description="تُمنح Coins فقط بعد إكمال جلسة كاملة. يحسب الخادم وقت التركيز، وليس زر الإكمال فقط." />}<div className={embedded ? "grid gap-4" : "grid items-start gap-5 xl:grid-cols-[1fr_.65fr]"}><section className="surface flex min-h-[360px] flex-col items-center justify-center p-5 text-center sm:p-8"><p className="mb-5 text-sm font-semibold text-primary">{active ? (active.state === "paused" ? "الجلسة متوقفة مؤقتًا" : routine?.sessionId === active.id ? "جولة " + routine.round + " من " + routine.rounds : "حان وقت التركيز") : "اختر مدة جلسة"}</p><div className="study-focus-ring flex size-52 items-center justify-center rounded-full sm:size-64" data-running={active?.state === "running"} style={{ "--study-progress": progress + "%" } as CSSProperties}><div className="study-focus-face"><Timer className="mx-auto mb-2 size-5 text-primary" aria-hidden /><p className="font-[Manrope] text-5xl sm:text-6xl font-extrabold tracking-tighter text-primary">{pretty}</p><p className="mt-2 text-sm text-muted-foreground">{active ? `${active.plannedMinutes} دقيقة تركيز` : "جاهز للبدء"}</p></div></div><FloatingFocus seconds={betweenRounds ? breakRemaining || routine.minutes * 60 : remaining} status={floatingStatus}
  action={floatingAction} round={routine && (betweenRounds || routine.sessionId === active?.id) ? routine.round + " / " + routine.rounds : undefined} />
<div className="mt-7 flex flex-wrap justify-center gap-2">{!active ? <div className="w-full space-y-4">
  {routine && finishedRound && routine.round < routine.rounds ? <div className="space-y-3">
    <p>خلصت الجولة {routine.round} من {routine.rounds}</p>
    <p>{breakRemaining ? "البريك المتبقي: " + Math.floor(breakRemaining / 60) + ":" + String(breakRemaining % 60).padStart(2, "0") : "جاهز للجولة الجاية"}</p>
    <Button disabled={breakRemaining > 0 || start.isPending} onClick={() => {
      startNextRound();
    }}>ابدأ الجولة الجاية</Button>
    <Button variant="ghost" disabled={start.isPending} onClick={() => setRoutine(undefined)}>إنهاء الخطة</Button>
  </div> : <>
    <div className="flex justify-center gap-2" aria-label="نوع جلسة التركيز">
      <Button variant={mode === "quick" ? "default" : "outline"} aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>جلسة سريعة</Button>
      <Button variant={mode === "custom" ? "default" : "outline"} aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>خطة مخصصة</Button>
    </div>
    {mode === "quick" ? <div className="flex justify-center gap-1">{presets.map(min => <Button key={min} size="sm" variant={selected === min ? "default" : "outline"} onClick={() => setSelected(min)}>{min} د</Button>)}</div>
      : <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <label>ساعات التركيز<Input type="number" min={0} max={12} value={hours} onChange={e => setHours(Number(e.target.value))} /></label>
          <label>دقائق التركيز<Input type="number" min={0} max={59} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
          <label>دقائق البريك<Input type="number" min={0} max={120} value={rest} onChange={e => setRest(Number(e.target.value))} /></label>
          <label>عدد الجولات<Input type="number" min={1} max={12} value={rounds} onChange={e => setRounds(Number(e.target.value))} /></label>
        </div>
        {valid ? <p className="text-sm">تركيز {minutesLabel(customMinutes * rounds)} · بريك {rest * (rounds - 1)} دقيقة · {rates ? money.format(reward) + " كوينز للجولة / " + money.format(reward * rounds) + " للخطة" : "جارٍ تحميل المكافأة…"}</p>
          : <p className="text-sm text-destructive">اختار تركيز من ٥ دقايق لـ١٢ ساعة، وبريك لحد ١٢٠ دقيقة، ومن جولة لـ١٢ جولة.</p>}
      </div>}
    <div className="flex flex-wrap justify-center gap-2">
      <select aria-label="مادة الجلسة" className="rounded-lg border bg-background px-3 text-sm" value={subject} onChange={event => setSubject(event.target.value)}>
        <option value="">من غير مادة</option>{subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
      </select>
      <Button size="lg" disabled={start.isPending || (mode === "custom" && !valid)} onClick={() => {
        startFocus();
      }}><Play />ابدأ التركيز</Button>
    </div>
  </>}
</div> : <>{remaining === 0 ? <Button size="lg" disabled={complete.isPending} onClick={() => complete.mutate({ sessionId: active.id })}><Trophy />تسجيل الإكمال</Button> : <Button size="lg" variant={active.state === "paused" ? "default" : "outline"} disabled={pause.isPending} onClick={() => pause.mutate({ sessionId: active.id, paused: active.state === "running" })}>{active.state === "paused" ? <><Play />استئناف</> : <><Pause />إيقاف مؤقت</>}</Button>}<Button size="lg" variant="ghost" disabled><RotateCcw />إلغاء</Button></>}</div></section><aside className="space-y-4"><div className="surface p-5"><div className="mb-4 flex items-center gap-2"><Coffee className="size-5 text-orange-600" /><h2 className="font-bold">مكافآت الجلسات</h2></div><div className="space-y-3">{presets.map(x => <div key={x} className="flex items-center justify-between gap-2 rounded-xl bg-muted/65 px-3 py-2.5 text-sm"><span className="flex items-center gap-2"><Timer className="size-4 text-primary" aria-hidden />{x} دقيقة</span><b className="font-[Manrope] text-primary">{rates ? "+" + money.format(rates.find(rate => rate.key === "pomodoro_" + x)?.amount ?? 0) + " Coins" : "…"}</b></div>)}</div></div><div className="surface p-5"><div className="mb-4 flex items-center gap-2"><Timer className="size-5 text-primary" /><h2 className="font-bold">سجل الجلسات</h2></div>{history.length ? <>
  <div className="max-h-56 space-y-2 overflow-y-auto" aria-label="جلسات البومودورو المكتملة">
    {(showHistory ? history : history.slice(0, 5)).map(session => <div key={session.id} className="flex justify-between gap-2 rounded-lg bg-muted/45 px-3 py-2 text-sm">
      <span>{minutesLabel(session.completedMinutes || session.plannedMinutes)}</span>
      <span className="text-muted-foreground">{session.completedAt ? new Date(session.completedAt).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" }) : ""}</span>
    </div>)}
  </div>
  {history.length > 5 && <Button className="mt-2" size="sm" variant="ghost" aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>{showHistory ? "عرض آخر ٥ جلسات" : "عرض كل الجلسات"}</Button>}
</> : <p className="text-sm text-muted-foreground">أكمل جلسة لتظهر هنا.</p>}</div></aside></div><FocusAssignments subjects={subjects} /></div>; }
