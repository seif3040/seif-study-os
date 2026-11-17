import { useState } from "react";
import { useLocation } from "wouter";
import { Play, Timer } from "lucide-react";
import { toast } from "sonner";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { classifyStudySource, safeStudyUrl } from "@/lib/videoSources";
import { subjectKey, videoSubject } from "@shared/lessonSources";
import { cairoPlannerTime } from "@shared/examSchedule";
import { videoBlockSeconds } from "@shared/videoTimer";
import { plannerToday, slotOccurs } from "@shared/studyPlanner";

type StudyPick = { id: string; subjectId: number; subject: string; title: string; start: string; end: string; sourceId?: number };

export function QuickStudyStart({ day }: { day: string }) {
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const videos = trpc.video.open.useQuery();
  const sources = trpc.lessonSources.list.useQuery();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState("");
  const [retro, setRetro] = useState(false);
  const [elapsed, setElapsed] = useState(10);
  const [busy, setBusy] = useState(false);
  if (day !== plannerToday() || !planner.data || !plan.data || !videos.data || !sources.data) return null;

  const state = planner.data;
  const rows = plan.data.rows;
  const subjects = new Map(rows.map(row => [row.subject.id, row.subject.title]));
  const available = [...(state.studySessions ?? []).flatMap((item): StudyPick[] => {
    if (item.day !== day || item.done) return [];
    const lesson = item.lessonId === undefined ? undefined : rows.find(row => row.lesson?.id === item.lessonId);
    const kind = videoSubject(item.title);
    const subject = lesson?.subject ?? rows.find(row => subjectKey(row.subject.title) === subjectKey(item.title))?.subject
      ?? (kind === "other" ? undefined : rows.find(row => videoSubject(row.subject.title) === kind)?.subject);
    return subject ? [{ ...item, subjectId: subject.id, subject: subject.title }] : [];
  }), ...state.slots.flatMap((slot): StudyPick[] => {
    const subject = slot.subjectId && subjects.get(slot.subjectId);
    if (!subject || !slot.subjectId || !slotOccurs(slot, day)
      || state.attendance.some(item => item.slotId === slot.id && item.day === day)) return [];
    return [{ ...slot, subject, subjectId: slot.subjectId }];
  })];
  const now = Date.now();
  const rank = (item: StudyPick) => now < +cairoPlannerTime(day, item.start) ? 1 : now < +cairoPlannerTime(day, item.end) ? 0 : 2;
  available.sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start));
  const item = available.find(entry => entry.id === selected) ?? available[0];
  if (!item) return null;

  const subject = videoSubject(item.subject);
  const session = subject === "other" ? undefined : videos.data.find(video => video.subject === subject);
  const matching = sources.data.filter(source => source.active && source.delivery !== "in_person" && source.url
    && safeStudyUrl(source.url) && videoSubject(source.subject) === subject && subject !== "other");
  const source = matching.find(entry => entry.id === item.sourceId) ?? matching.find(entry => entry.role === "primary") ?? matching[0];
  const url = safeStudyUrl(session?.videoUrl ?? source?.url ?? "");
  const external = session ? session.sourceMode === "external" : Boolean(url && classifyStudySource(url) === "external");

  const retroMax = external ? Math.max(1, Math.floor(((session?.completedBlocks ?? 0) + 1) * videoBlockSeconds / 60
    - (session?.activeSeconds ?? 0) / 60)) : 120;

  async function launch(minutes = 0, focusOnly = false, withFocus = false) {
    if (busy || !item) return;
    const popup = external && !focusOnly && url ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    setBusy(true);
    try {
      if (focusOnly || withFocus || (!session && !url) || (!external && minutes > 0)) {
        const focus = await utils.client.pomodoro.start.mutate({ plannedMinutes: Math.max(25, minutes + 5),
          subjectId: item.subjectId, elapsedMinutes: minutes || undefined });
        if (focus?.subjectId !== item.subjectId) throw new Error("فيه مؤقت لمادة تانية شغّال. وقّفه الأول.");
        await utils.pomodoro.list.invalidate();
        if (focusOnly || (!session && !url)) {
          setRetro(false);
          navigate("/study-video#pomodoro");
          return;
        }
      }
      const video = session ?? await utils.client.video.start.mutate({
        subject, videoUrl: url!, lessonTitle: item.title, requestedMode: "auto",
      });
      if (video.sourceMode === "external") {
        if (!video.timerRunning || minutes > 0) {
          await utils.client.video.setExternalTimer.mutate({ sessionId: video.id, running: true, elapsedMinutes: minutes || undefined });
        }
        if (popup && url) popup.location.replace(url);
        if (!popup && url) toast.info("الجلسة بدأت. افتح المنصة من زر «افتح الدرس في المنصة».");
      }
      await utils.video.invalidate();
      setRetro(false);
      navigate("/study-video?subject=" + subject + (video.sourceMode === "embedded" ? "&play=1" : ""));
    } catch (error) {
      popup?.close();
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="surface space-y-3 p-4">
    <div>
      <h2 className="font-bold">ابدأ المذاكرة · {item.subject}</h2>
      <p className="text-sm text-muted-foreground">{session?.lessonTitle ?? item.title}{source && " · " + source.teacherName}</p>
    </div>
    {available.length > 1 && <select aria-label="اختار مذاكرة من جدول النهارده" value={item.id}
      onChange={event => setSelected(event.target.value)} className="w-full rounded-lg border bg-background p-2 text-sm">
      {available.map(entry => <option key={entry.id} value={entry.id}>{entry.subject} · {entry.title}</option>)}
    </select>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => void launch()}><Play />{external ? "افتح المنصة وابدأ المؤقت" : "ابدأ " + item.subject}</Button>
      {!external && (session || url) && <Button variant="outline" disabled={busy} onClick={() => void launch(0, false, true)}><Timer />فيديو + بومودورو</Button>}
      {(session || url) && <Button variant="outline" disabled={busy} onClick={() => void launch(0, true)}><Timer />تركيز بس</Button>}
      <Button variant="ghost" disabled={busy} onClick={() => { setElapsed(Math.min(10, retroMax)); setRetro(true); }}>بدأت من شوية</Button>
    </div>
    {retro && <ActionDialog title="بدأت من شوية" pending={busy} onClose={() => setRetro(false)}>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (Number.isInteger(elapsed) && elapsed >= 1 && elapsed <= retroMax) void launch(elapsed); }}>
        <label className="grid gap-1 text-sm">بدأت من كام دقيقة؟
          <Input type="number" min={1} max={retroMax} step={1} required value={elapsed} onChange={event => setElapsed(Number(event.target.value))} />
        </label>
        <p className="text-sm text-muted-foreground">{external ? "سجّل الدقائق لحد نهاية دورة الفيديو الحالية." : "الدقائق اللي فاتت هتتسجّل على مؤقت التركيز."}</p>
        <Button disabled={busy} type="submit">سجّل الوقت وكمّل</Button>
      </form>
    </ActionDialog>}
  </section>;
}
