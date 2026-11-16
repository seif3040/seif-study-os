import ActionDialog from "@/components/ActionDialog";
import { NoteWorkspace, NoteContent, noteSummary } from "@/components/NoteWorkspace";
import { YouTubeStudyPlayer } from "@/components/YouTubeStudyPlayer";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { errorText, money, shortDate } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { classifyStudySource, isDirectMedia, sourceDomain, youtubeEmbed } from "@/lib/videoSources";
import { BookOpen, CirclePause, CirclePlay, Clock3, Download, ExternalLink, History, Link2, ListChecks, Pause, Pencil, Play, PlayCircle, Printer, Save, ShieldCheck, Square, Timer, Trash2, Video, XCircle } from "lucide-react";
import { toast } from "sonner";

type SubjectKey = "arabic" | "history" | "english" | "programming_ai" | "german" | "other";
type ProgressKey = "started" | "middle" | "finished" | "reviewed";
const subjects: Record<SubjectKey, string> = { arabic: "عربي", history: "تاريخ", english: "إنجليزي", programming_ai: "برمجة وذكاء اصطناعي", german: "ألماني", other: "أخرى" };
const progressLabels: Record<ProgressKey, string> = { started: "لسه بادئ", middle: "في النص", finished: "خلصت الشرح", reviewed: "راجعت الواجب" };
function clock(seconds: number) { return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function noteTime(seconds: number | null) { return seconds == null ? "بدون توقيت" : `عند ${clock(seconds)}`; }

type VideoNote = { id: number; title: string; content: string; timestampSeconds: number | null; updatedAt: string | Date };
type VideoHistoryItem = { id: number; videoUrl: string; lessonTitle: string | null; subject: SubjectKey; sourceMode: "embedded" | "external"; manualProgress: ProgressKey; activeSeconds: number; completedBlocks: number; phase: string; updatedAt: string | Date; notes: VideoNote[] };

type BookmarkSession = { id: number; userId: number; updatedAt: Date | string; lastPlaybackPosition?: number | null };
const bookmarkKey = (session: BookmarkSession) => "study-video-position:" + session.userId + ":" + session.id;

function resumePosition(session?: BookmarkSession | null) {
  if (!session) return 0;
  try {
    const mark = JSON.parse(localStorage.getItem(bookmarkKey(session)) ?? "null");
    if (mark && Number.isFinite(mark.seconds) && mark.seconds >= 0 && mark.savedAt >= +new Date(session.updatedAt)) return mark.seconds;
  } catch { /* Server position remains available when storage is disabled. */ }
  return session.lastPlaybackPosition ?? 0;
}

export default function StudyVideo({ embedded = false }: { embedded?: boolean }) {
  const open = trpc.video.open.useQuery();
  const [selected, setSelected] = useState<SubjectKey>();
  const files = useRef(new Map<number, File>());
  const subject = selected ?? open.data?.[0]?.subject ?? "other";
  if (open.isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  return <div className="space-y-4">
    {!embedded && <PageHeader title="فيديو المذاكرة" description="كمّل فيديو كل مادة من آخر مكان وقفت عنده." />}
    <section className="surface space-y-2 p-3" aria-label="جلسات المواد">
      <h2 className="font-semibold">جلسات المواد</h2>
      {open.isError && <p className="text-sm">تعذّر تحميل الجلسات. <Button variant="ghost" size="sm" onClick={() => void open.refetch()}>جرّب تاني</Button></p>}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(subjects) as SubjectKey[]).filter(key => key !== "german" || open.data?.some(item => item.subject === key)).map(key =>
          <Button key={key} size="sm" variant={key === subject ? "default" : "outline"}
            aria-pressed={key === subject} onClick={() => setSelected(key)}>
            {subjects[key]}{open.data?.some(item => item.subject === key) ? " · جلسة مفتوحة" : ""}
          </Button>)}
      </div>
    </section>
    <SubjectVideoSession key={subject} subject={subject} files={files.current} />
  </div>;
}

function SubjectVideoSession({ subject, files }: { subject: SubjectKey; files: Map<number, File> }) {
  const utils = trpc.useUtils();
  const reward = trpc.economy.rates.useQuery().data?.find(item => item.key === "video_block")?.amount; const { data: session, isLoading } = trpc.video.current.useQuery({ subject }); const { data: history = [] } = trpc.video.history.useQuery();
  const [url, setUrl] = useState(""); const [lessonTitle, setLessonTitle] = useState(""); const [requestedMode, setRequestedMode] = useState<"auto" | "embedded" | "external">("auto"); const [now, setNow] = useState(Date.now()); const [noteRevision, setNoteRevision] = useState(0); const [noteTitle, setNoteTitle] = useState(""); const [noteContent, setNoteContent] = useState(""); const [editingNote, setEditingNote] = useState<VideoNote | null>(null); const video = useRef<HTMLVideoElement>(null); const interval = useRef<number | null>(null);
  const [file, setFile] = useState<File>();
  const [localUrl, setLocalUrl] = useState("");
  const localSession = session?.videoUrl.startsWith("local-video:");
  const selectedFile = session ? file ?? files.get(session.id) : file;
  useEffect(() => {
    if (!selectedFile) { setLocalUrl(""); return; }
    const playbackUrl = URL.createObjectURL(selectedFile);
    setLocalUrl(playbackUrl);
    return () => URL.revokeObjectURL(playbackUrl);
  }, [selectedFile]);
  const localStart = trpc.video.startLocal.useMutation({
    onSuccess: async created => { if (file) files.set(created.id, file); await invalidate(); toast.success("الفيديو جاهز للمشاهدة."); },
    onError: error => toast.error(errorText(error)),
  });
  const [position, setPosition] = useState<{ id: number; seconds: number }>();
  const latestPosition = useRef<{ id: number; seconds: number } | undefined>(undefined);
  const videoPosition = position?.id === session?.id ? position?.seconds ?? 0 : resumePosition(session);
  const updatePosition = (seconds: number) => {
    if (!session || !Number.isFinite(seconds) || seconds < 0) return;
    const next = { id: session.id, seconds: Math.floor(seconds) };
    if (latestPosition.current?.id === next.id && latestPosition.current.seconds === next.seconds) return;
    latestPosition.current = next;
    setPosition(next);
    try {
      localStorage.setItem(bookmarkKey(session), JSON.stringify({ seconds: next.seconds, savedAt: Date.now() }));
    } catch { /* The regular server heartbeat also saves progress. */ }
  };
  const preview = useMemo(() => classifyStudySource(url), [url]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const invalidate = () => Promise.all([utils.video.current.invalidate(), utils.video.open.invalidate(), utils.video.history.invalidate(), utils.dashboard.summary.invalidate(), utils.analytics.overview.invalidate(), utils.coins.ledger.invalidate()]);
  const start = trpc.video.start.useMutation({ onSuccess: async () => { setUrl(""); setLessonTitle(""); toast.success("يلا نبدأ — اتسجلت جلسة الدرس."); await invalidate(); }, onError: e => toast.error(errorText(e)) });
  const end = trpc.video.end.useMutation({ onSuccess: async (_, { sessionId }) => { files.delete(sessionId); if (session?.id === sessionId) { try { localStorage.removeItem(bookmarkKey(session)); } catch {} } setFile(undefined); toast.success("كملها للآخر — اتسجلت الجلسة."); await invalidate(); }, onError: e => toast.error(errorText(e)) });
  const heartbeat = trpc.video.heartbeat.useMutation({ onSuccess: async result => { if (result.blockCompleted) { toast.success("أحسنت! بدأت استراحة 15 دقيقة."); video.current?.pause(); await invalidate(); } else if (result.session) { utils.video.current.setData({ subject }, current => current?.id === result.session.id ? result.session : current); } }, onError: e => toast.error(errorText(e)) });
  const resume = trpc.video.resume.useMutation({ onSuccess: async () => { await invalidate(); video.current?.play().catch(() => undefined); }, onError: e => toast.error(errorText(e)) });
  const externalTimer = trpc.video.setExternalTimer.useMutation({ onSuccess: async result => { if (result.blockCompleted) toast.success("45 دقيقة تركيز! خُد استراحة 15 دقيقة."); await invalidate(); }, onError: e => toast.error(errorText(e)) });
  const setProgress = trpc.video.setProgress.useMutation({ onSuccess: async () => { toast.success("اتحفظ تقدّمك."); await invalidate(); }, onError: e => toast.error(errorText(e)) });
  const createNote = trpc.video.createNote.useMutation({ onSuccess: async () => { setNoteTitle(""); setNoteContent(""); setNoteRevision(value => value + 1); toast.success("تم حفظ الملاحظة."); await utils.video.history.invalidate(); }, onError: e => toast.error(errorText(e)) });
  const updateNote = trpc.video.updateNote.useMutation({ onSuccess: async () => { setEditingNote(null); setNoteTitle(""); setNoteContent(""); toast.success("تم تحديث الملاحظة."); await utils.video.history.invalidate(); }, onError: e => toast.error(errorText(e)) });
  const deleteNote = trpc.video.deleteNote.useMutation({ onSuccess: async () => { toast.success("تم حذف الملاحظة."); await utils.video.history.invalidate(); }, onError: e => toast.error(errorText(e)) });
  const read = useRef<(() => number) | null>(null);
  const playbackRate = useRef<() => number>(() => 1);
  const queue = useRef(Promise.resolve());
  const [playing, setPlaying] = useState(false);
  const send = (active: boolean, position: number, reset = false) => {
    if (!session || session.sourceMode === "external" || !Number.isFinite(position)) return;
    const input = { sessionId: session.id, active, reset, playbackRate: playbackRate.current() || 1, playbackPosition: Math.min(172800, Math.max(0, Math.floor(position))) };
    queue.current = queue.current.then(async () => { await heartbeat.mutateAsync(input); }).catch(() => undefined);
  };
  const onPlay = (position: () => number, rate: () => number) => {
    if (interval.current) return;
    read.current = position;
    playbackRate.current = rate;
    setPlaying(true);
    send(true, position(), true);
    interval.current = window.setInterval(() => send(true, position()), 5000);
  };
  const onPause = (position?: number) => {
    if (!interval.current) return;
    clearInterval(interval.current);
    interval.current = null;
    const stoppedAt = position ?? read.current?.() ?? videoPosition;
    updatePosition(stoppedAt);
    send(false, stoppedAt);
    setPlaying(false);
  };
  useEffect(() => {
    const saveOnExit = () => {
      if (!interval.current) return;
      const seconds = read.current?.();
      if (typeof seconds === "number") updatePosition(seconds);
    };
    window.addEventListener("pagehide", saveOnExit);
    return () => {
      window.removeEventListener("pagehide", saveOnExit);
      saveOnExit();
      if (interval.current) clearInterval(interval.current);
      interval.current = null;
    };
  }, [session?.id]);
  const breakRemaining = session?.phase === "break" && session.breakEndsAt ? Math.max(0, Math.ceil((new Date(session.breakEndsAt).getTime() - now) / 1000)) : 0;
  useEffect(() => { if (session?.sourceMode !== "external" && session?.phase === "break" && breakRemaining === 0 && !resume.isPending) resume.mutate({ sessionId: session.id }); }, [breakRemaining, session?.id, session?.phase, session?.sourceMode]);
  useEffect(() => {
    if (!session || session.sourceMode !== "embedded" || session.phase !== "watching" || playing ||
        position?.id !== session.id || position.seconds === session.lastPlaybackPosition) return;
    const timer = window.setTimeout(() => send(false, position.seconds), 350);
    return () => window.clearTimeout(timer);
  }, [position, playing, session?.id, session?.phase, session?.lastPlaybackPosition]);
  useEffect(() => {
    if (session?.phase !== "break") return;
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
    setPlaying(false);
  }, [session?.phase]);
  const activeNow = session?.sourceMode === "embedded" ? Math.max(session.activeSeconds, videoPosition)
    : session?.timerRunning && session.lastPlaybackAt
      ? session.activeSeconds + Math.max(0, Math.floor((now - +new Date(session.lastPlaybackAt)) / 1000))
      : session?.activeSeconds ?? 0;
  const launch = () => { if (preview === "invalid") { toast.error("استخدم رابطًا صالحًا يبدأ بـ http:// أو https://."); return; } start.mutate({ videoUrl: url.trim(), lessonTitle: lessonTitle.trim() || undefined, subject, requestedMode }); };
  const noteTimestamp = session?.sourceMode === "external" ? activeNow : Math.floor(video.current?.currentTime ?? videoPosition);
  const saveNote = () => { if ((!session && !editingNote) || !noteTitle.trim() || !noteContent.trim()) return; const timestampSeconds = editingNote ? editingNote.timestampSeconds ?? undefined : noteTimestamp; if (editingNote) updateNote.mutate({ noteId: editingNote.id, title: noteTitle.trim(), content: noteContent.trim(), timestampSeconds }); else createNote.mutate({ sessionId: session!.id, title: noteTitle.trim(), content: noteContent.trim(), timestampSeconds }); };
  const beginEdit = (note: VideoNote) => { setEditingNote(note); setNoteTitle(note.title); setNoteContent(note.content); };
  if (isLoading) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  return <div>
    {!session ? <><section className="surface mb-4 space-y-2 p-4">
      <label className="block font-semibold">فيديو من الجهاز<Input type="file" accept="video/*,.mkv,.avi" disabled={localStart.isPending || start.isPending}
        onChange={event => setFile(event.target.files?.[0])} /></label>
      <p className="text-xs text-muted-foreground">الفيديو بيتشغّل من جهازك في جلسة {subjects[subject]}.</p>
      <Button disabled={!file || localStart.isPending || start.isPending} onClick={() => file && localStart.mutate({ lessonTitle: (lessonTitle.trim() || file.name).slice(0, 220), subject })}>ابدأ فيديو من الجهاز</Button>
    </section><VideoSetup lessonTitle={lessonTitle} url={url} subject={subject} requestedMode={requestedMode} preview={preview} busy={start.isPending || localStart.isPending} onTitle={setLessonTitle} onUrl={setUrl} onMode={setRequestedMode} onStart={launch} />{editingNote && <div className="mx-auto mt-5 max-w-5xl"><NoteEditor key={editingNote?.id ?? "new-" + noteRevision} title={noteTitle} content={noteContent} editing onTitle={setNoteTitle} onContent={setNoteContent} onSave={saveNote} onCancel={() => { setEditingNote(null); setNoteTitle(""); setNoteContent(""); }} busy={updateNote.isPending} /></div>}<VideoHistory history={history as VideoHistoryItem[]} onEdit={beginEdit} onDelete={noteId => deleteNote.mutate({ noteId })} /></> : <><div className="grid gap-5 xl:grid-cols-[1fr_.36fr]"><section className="surface overflow-hidden">{session.sourceMode === "external" ? <ExternalLessonCard session={session} activeSeconds={activeNow} breakRemaining={breakRemaining} busy={externalTimer.isPending || resume.isPending} onSkipBreak={() => resume.mutate({ sessionId: session.id, skipBreak: true })} onTimer={running => externalTimer.mutate({ sessionId: session.id, running })} onProgress={progress => setProgress.mutate({ sessionId: session.id, progress })} /> : localSession && !localUrl && session.phase !== "break" ? <div className="space-y-2 p-4">
        <label className="block">اختار نفس ملف الفيديو عشان تكمّل من مكانك<Input type="file" accept="video/*,.mkv,.avi" onChange={event => { const picked = event.target.files?.[0]; if (picked) files.set(session.id, picked); setFile(picked); }} /></label>
      </div> : <Player key={session.id} localUrl={localSession ? localUrl : undefined} session={session} startAt={videoPosition} video={video} onPosition={updatePosition} onPlay={onPlay} onPause={onPause} breakRemaining={breakRemaining} resumePending={resume.isPending} onResume={() => resume.mutate({ sessionId: session.id, skipBreak: true })} />}<div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">{session.sourceMode === "external" ? "جلسة درس خارجي نشطة" : "جلسة فيديو نشطة"}</p><p className="mt-1 text-xs text-muted-foreground">{session.lessonTitle || sourceDomain(session.videoUrl)} · {subjects[session.subject as SubjectKey]}</p></div><Button size="sm" variant="outline" disabled={end.isPending} onClick={async () => { video.current?.pause(); onPause(); if (session.sourceMode === "embedded" && position?.id === session.id) send(false, video.current?.currentTime ?? position.seconds); await queue.current; end.mutate({ sessionId: session.id }); }}><Square />إنهاء الجلسة</Button>{!youtubeEmbed(session.videoUrl) && session.sourceMode === "embedded" && document.pictureInPictureEnabled && <Button size="sm" variant="outline" onClick={() => void video.current?.requestPictureInPicture().catch(() => toast.error("شغّل الفيديو الأول."))}>نافذة فيديو عائمة</Button>}</div></section><VideoSidebar session={session} activeSeconds={activeNow} position={videoPosition} reward={reward} /></div><div className="mt-5 grid gap-5 lg:grid-cols-[.72fr_1fr]"><NoteEditor key={editingNote?.id ?? "new-" + noteRevision} title={noteTitle} content={noteContent} editing={Boolean(editingNote)} onTitle={setNoteTitle} onContent={setNoteContent} onSave={saveNote} onCancel={() => { setEditingNote(null); setNoteTitle(""); setNoteContent(""); }} busy={createNote.isPending || updateNote.isPending} external={session.sourceMode === "external"} /><VideoHistory history={history as VideoHistoryItem[]} sessionId={session.id} onEdit={beginEdit} onDelete={noteId => deleteNote.mutate({ noteId })} /></div></>}
  </div>;
}

function VideoSetup({ lessonTitle, url, subject, requestedMode, preview, busy, onTitle, onUrl, onMode, onStart }: { lessonTitle: string; url: string; subject: SubjectKey; requestedMode: "auto" | "embedded" | "external"; preview: "embedded" | "external" | "invalid"; busy: boolean; onTitle: (value: string) => void; onUrl: (value: string) => void; onMode: (value: "auto" | "embedded" | "external") => void; onStart: () => void }) { const external = preview === "external" || requestedMode === "external"; return <section className="surface mx-auto max-w-3xl p-6 sm:p-8"><div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Video /></div><h2 className="text-xl font-bold">يلا نبدأ درس جديد</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">YouTube والملفات المباشرة تتعرض هنا. الكورسات الخاصة تفتح في منصتها الأصلية من غير ما نطلب بياناتك أو نتدخل في حمايتها.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><Input value={lessonTitle} onChange={event => onTitle(event.target.value)} placeholder="عنوان الدرس — اختياري" /><p className="self-center text-sm text-muted-foreground">{subjects[subject]}</p></div><Input dir="ltr" className="mt-3" value={url} onChange={event => onUrl(event.target.value)} onKeyDown={event => event.key === "Enter" && onStart()} placeholder="https://youtube.com/... أو رابط الدرس" /><select className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={requestedMode} onChange={event => onMode(event.target.value as "auto" | "embedded" | "external")} aria-label="نوع المصدر"><option value="auto">اكتشاف النوع تلقائيًا</option><option value="embedded">مشاهدة داخل الموقع</option><option value="external">درس على منصة خارجية</option></select><div className={`mt-4 rounded-2xl border p-4 text-sm ${preview === "invalid" ? "border-destructive/30 bg-destructive/5" : external ? "border-amber-300/50 bg-amber-50/70 text-amber-950" : "border-primary/20 bg-primary/5"}`}>{preview === "invalid" ? <><XCircle className="mb-2 size-5" /><p className="font-bold">أدخل رابط الدرس عشان نشوف هيتفتح إزاي</p></> : external ? <><ShieldCheck className="mb-2 size-5" /><p className="font-bold">هتذاكر على المنصة الأصلية 🔐</p><p className="mt-1 text-xs leading-5">هنفتح الدرس في تبويب جديد، وجارفيس يتابع وقتك وملاحظاتك وتقدمك هنا بس.</p></> : <><PlayCircle className="mb-2 size-5 text-primary" /><p className="font-bold">يتعرض هنا 🎬</p><p className="mt-1 text-xs leading-5">الرابط مناسب للمشاهدة داخل Seif Study OS.</p></>}</div><Button className="mt-5 w-full" disabled={!url.trim() || preview === "invalid" || busy} onClick={onStart}>{external ? <><ExternalLink />ابدأ جلسة وافتح الدرس</> : <><Play />ابدأ المشاهدة</>}</Button></section>; }

function ExternalLessonCard({ session, activeSeconds, breakRemaining, busy, onSkipBreak, onTimer, onProgress }: { session: any; activeSeconds: number; breakRemaining: number; busy: boolean; onSkipBreak: () => void; onTimer: (running: boolean) => void; onProgress: (progress: ProgressKey) => void }) { const inBreak = session.phase === "break" && breakRemaining > 0; return <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Link2 className="size-5" /></span><div><p className="text-xs text-emerald-200">درس على منصة خارجية</p><h2 className="mt-1 text-xl font-bold">{session.lessonTitle || sourceDomain(session.videoUrl)}</h2><p className="mt-1 text-sm text-slate-300">{sourceDomain(session.videoUrl)} · {subjects[session.subject as SubjectKey]}</p></div></div><a href={session.videoUrl} target="_blank" rel="noopener noreferrer"><Button className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300"><ExternalLink />افتح الدرس في المنصة</Button></a></div><p className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">افتح الدرس من منصته، وسيب التنظيم والمتابعة علينا 💪</p>{inBreak ? <div className="mt-6 rounded-2xl bg-amber-300 p-5 text-center text-slate-950"><CirclePause className="mx-auto size-7" /><p className="mt-2 text-sm font-bold">استراحة مستحقة</p><p className="mt-1 text-3xl font-black">{clock(breakRemaining)}</p><p className="mt-2 text-xs">استأنف المؤقت لما الاستراحة تخلص.</p><Button size="sm" disabled={busy} onClick={onSkipBreak}>تخطّي الاستراحة</Button></div> : <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-300">وقت الجلسة النشط</p><p className="mt-1 font-mono text-4xl font-black tracking-wider">{clock(activeSeconds)}</p></div><Button className="h-auto min-h-24 px-6" variant={session.timerRunning ? "destructive" : "secondary"} disabled={busy} onClick={() => onTimer(!session.timerRunning)}>{session.timerRunning ? <><Pause />إيقاف مؤقت</> : <><Timer />{session.activeSeconds ? "استئناف" : "ابدأ"}</>}</Button></div>}<div className="mt-5"><p className="mb-2 text-xs font-bold text-slate-300">تقدّمك اليدوي</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(Object.keys(progressLabels) as ProgressKey[]).map(progress => <Button key={progress} size="sm" variant={session.manualProgress === progress ? "secondary" : "outline"} className={session.manualProgress === progress ? "text-slate-950" : "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"} onClick={() => onProgress(progress)}><ListChecks />{progressLabels[progress]}</Button>)}</div></div></div>; }

function NoteEditor({ title, content, editing, onTitle, onContent, onSave, onCancel, busy, external = false }: { title: string; content: string; editing: boolean; onTitle: (value: string) => void; onContent: (value: string) => void; onSave: () => void; onCancel: () => void; busy: boolean; external?: boolean }) {
  const [recording, setRecording] = useState(false);
  const editor = <section className={editing ? "space-y-2" : "surface p-5"}>{!editing && <div className="mb-4 flex items-center gap-2"><Pencil className="size-5 text-primary" /><h2 className="font-bold">ملاحظة سريعة</h2></div>}<Input value={title} onChange={event => onTitle(event.target.value)} placeholder="عنوان الملاحظة" /><NoteWorkspace key={editing ? "edit" : "new"} value={content} onChange={onContent} onBusy={setRecording} /><p className="mt-2 text-xs text-muted-foreground">{external ? "سيتم ربط الملاحظة بوقت الجلسة الخارجي المسجل هنا." : "سيتم حفظ توقيت التشغيل الحالي تلقائيًا مع الملاحظة."}</p><div className="mt-4 flex gap-2"><Button disabled={!title.trim() || !content.trim() || busy || recording} onClick={onSave}><Save />حفظ الملاحظة</Button>{editing && <Button variant="outline" disabled={recording} onClick={onCancel}>إلغاء</Button>}</div></section>;
  return editing ? <ActionDialog title="تعديل الملاحظة" pending={busy || recording} onClose={onCancel}>{editor}</ActionDialog> : editor; }

function safeExportName(url: string) { return (url.match(/(?:v=|youtu\.be\/|\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? "video-notes").slice(0, 48); }
export function formatVideoNotesText(item: VideoHistoryItem) { const title = item.lessonTitle || sourceDomain(item.videoUrl); const lines = [`Seif Study OS — ملاحظات الدرس`, `الدرس: ${title}`, `المادة: ${subjects[item.subject]}`, `المصدر: ${item.sourceMode === "external" ? "منصة خارجية" : "داخل الموقع"}`, `التقدم: ${progressLabels[item.manualProgress]}`, `الرابط: ${item.videoUrl}`, `تاريخ آخر نشاط: ${shortDate.format(new Date(item.updatedAt))}`, `وقت المذاكرة النشط: ${clock(item.activeSeconds)}`, `الدورات المكتملة: ${item.completedBlocks}`, "", ...item.notes.flatMap((note, index) => [`${index + 1}. ${note.title}`, `${noteTime(note.timestampSeconds)} · ${shortDate.format(new Date(note.updatedAt))}` , noteSummary(note.content), ""])]; return lines.join("\n"); }
function downloadText(item: VideoHistoryItem) { const blob = new Blob(["\ufeff" + formatVideoNotesText(item)], { type: "text/plain;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${safeExportName(item.videoUrl)}-notes.txt`; link.click(); URL.revokeObjectURL(link.href); toast.success("تم تنزيل الملاحظات كملف نصي."); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char); }
function printPdf(item: VideoHistoryItem) { const popup = window.open("", "_blank", "width=900,height=700"); if (!popup) { toast.error("اسمح بالنوافذ المنبثقة لإنشاء ملف PDF."); return; } const notes = item.notes.map((note, index) => `<article><h2>${index + 1}. ${escapeHtml(note.title)}</h2><p class=meta>${escapeHtml(noteTime(note.timestampSeconds))} · ${escapeHtml(shortDate.format(new Date(note.updatedAt)))}</p><p>${escapeHtml(noteSummary(note.content)).replace(/\n/g, "<br />")}</p></article>`).join(""); popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملاحظات الدرس</title><style>body{font-family:Arial,sans-serif;line-height:1.8;padding:40px;color:#10211d}h1{color:#087f6a;border-bottom:2px solid #bde7dc;padding-bottom:12px}h2{margin-bottom:4px}p{white-space:normal}.meta{color:#60736e;font-size:12px}article{border-bottom:1px solid #d9e4e0;padding:14px 0}@media print{button{display:none}}</style></head><body><h1>ملاحظات الدرس</h1><p>${escapeHtml(item.lessonTitle || sourceDomain(item.videoUrl))}</p><p>${escapeHtml(subjects[item.subject])} · ${escapeHtml(item.sourceMode === "external" ? "منصة خارجية" : "داخل الموقع")} · ${escapeHtml(progressLabels[item.manualProgress])}</p><p class="meta">${escapeHtml(shortDate.format(new Date(item.updatedAt)))} · ${clock(item.activeSeconds)} مذاكرة · ${item.completedBlocks} دورات</p>${notes || "<p>لا توجد ملاحظات لهذا الدرس.</p>"}<button onclick="window.print()">طباعة / حفظ كـ PDF</button></body></html>`); popup.document.close(); popup.focus(); window.setTimeout(() => popup.print(), 300); }

function VideoHistory({ history, sessionId, onEdit, onDelete }: { history: VideoHistoryItem[]; sessionId?: number; onEdit: (note: VideoNote) => void; onDelete: (noteId: number) => void }) { const items = sessionId ? history.filter(item => item.id === sessionId) : history; return <section className="surface mx-auto mt-5 w-full max-w-5xl p-5"><div className="mb-4 flex items-center gap-2"><History className="size-5 text-primary" /><h2 className="font-bold">سجل الدروس والملاحظات</h2></div>{items.length ? <div className="space-y-4">{items.map(item => <article key={item.id} className="rounded-2xl border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.lessonTitle || sourceDomain(item.videoUrl)}</p><p className="mt-1 text-xs text-muted-foreground">{subjects[item.subject]} · {item.sourceMode === "external" ? "على منصة خارجية" : "داخل الموقع"} · {progressLabels[item.manualProgress]}</p><p className="mt-1 text-xs text-muted-foreground">{shortDate.format(new Date(item.updatedAt))} · {clock(item.activeSeconds)} مذاكرة · {item.completedBlocks} دورات</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{item.notes.length} ملاحظات</span>{item.sourceMode === "external" && <a href={item.videoUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><ExternalLink className="size-4" />افتح المصدر</Button></a>}<Button size="sm" variant="outline" onClick={() => downloadText(item)}><Download className="size-4" />TXT</Button><Button size="sm" variant="outline" onClick={() => printPdf(item)}><Printer className="size-4" />PDF</Button></div></div>{item.notes.length ? <div className="mt-4 space-y-3">{item.notes.map(note => <div key={note.id} className="rounded-xl bg-muted/50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{note.title}</p><div className="mt-1"><NoteContent value={note.content} /></div><p className="mt-2 text-xs text-primary">{noteTime(note.timestampSeconds)} · {shortDate.format(new Date(note.updatedAt))}</p></div><div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label="تعديل الملاحظة" onClick={() => onEdit(note)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="حذف الملاحظة" onClick={() => onDelete(note.id)}><Trash2 className="size-4 text-destructive" /></Button></div></div></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">لا توجد ملاحظات لهذا الدرس حتى الآن.</p>}</article>)}</div> : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">ستظهر هنا الدروس وملاحظاتها بعد بدء أول جلسة.</div>}</section>; }

function Player({ session, startAt, localUrl, video, onPosition, onPlay, onPause, breakRemaining, onResume, resumePending }:  { session: any; startAt: number; localUrl?: string; onPosition: (seconds: number) => void; video: React.RefObject<HTMLVideoElement | null>; onPlay: (read: () => number, rate: () => number) => void; onPause: (position?: number) => void; breakRemaining: number; onResume: () => void; resumePending: boolean }) { const embed = youtubeEmbed(session.videoUrl); if (session.phase === "break") return <div className="relative aspect-video bg-slate-950"><div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white"><CirclePause className="mb-4 size-10 text-amber-300" /><p className="text-sm text-slate-300">فترة استراحة</p><p className="font-[Manrope] text-6xl font-extrabold">{String(Math.floor(breakRemaining / 60)).padStart(2, "0")}:{String(breakRemaining % 60).padStart(2, "0")}</p><Button className="mt-5" onClick={onResume} disabled={resumePending}><CirclePlay />{breakRemaining > 0 ? "تخطّي الاستراحة" : "استئناف"}</Button></div></div>; if (embed) return <YouTubeStudyPlayer embed={embed} startAt={startAt} onPlaying={onPlay} onStopped={onPause} onPosition={onPosition} />; if (localUrl || isDirectMedia(session.videoUrl)) return <div className="aspect-video bg-black"><video ref={video} controls className="h-full w-full" src={localUrl || session.videoUrl} onError={() => toast.error("المتصفح مش قادر يشغّل الملف ده. جرّب MP4 أو WebM.")} onLoadedMetadata={() => {
  if (video.current && startAt > 0 && startAt < video.current.duration) {
    video.current.currentTime = startAt;
  }
}} onTimeUpdate={event => onPosition(event.currentTarget.currentTime)} onSeeked={event => onPosition(event.currentTarget.currentTime)} onPlaying={() => onPlay(() => video.current?.currentTime ?? 0, () => video.current?.playbackRate ?? 1)} onPause={() => onPause()} onEnded={() => onPause()} onWaiting={() => onPause()} onSeeking={() => onPause()}>متصفحك لا يدعم تشغيل الفيديو.</video></div>; return <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-white"><XCircle className="size-11 text-rose-300" /><p className="font-bold">هذا الرابط ليس فيديو مدعومًا</p><p className="max-w-md text-sm text-slate-300">افتح الرابط في منصته الأصلية من خلال جلسة خارجية آمنة.</p></div>; }

function VideoSidebar({ session, activeSeconds, position, reward }: { session: any; activeSeconds: number; position: number; reward?: number }) { return <aside className="space-y-4"><div className="surface p-5"><p className="text-xs font-bold tracking-[.12em] text-primary">{session.sourceMode === "external" ? "وقت المذاكرة النشط" : "موضع الفيديو"}</p><p className="mt-2 font-[Manrope] text-4xl font-extrabold">{clock(session.sourceMode === "external" ? activeSeconds : position)}</p><p className="mt-2 text-sm text-muted-foreground">{session.sourceMode === "external" ? "مؤقت يدوي؛ التقدم من المنصة الأصلية ما بيتقراش هنا." : "التقدّم المحتسب للمكافآت: " + clock(activeSeconds) + ". كل 45 دقيقة تقدّم تفتح دورة راحة."}</p></div><div className="surface p-5"><div className="mb-4 flex items-center gap-2"><PlayCircle className="size-5 text-primary" /><h2 className="font-bold">دورات مكتملة</h2></div><p className="font-[Manrope] text-3xl font-extrabold">{money.format(session.completedBlocks)}</p><p className="mt-1 text-sm text-muted-foreground">{reward === undefined ? "جارٍ تحميل المكافأة…" : money.format(reward) + " Coins لكل دورة جديدة"}</p></div><div className="surface p-5 text-sm leading-6 text-muted-foreground"><Clock3 className="mb-2 size-5 text-primary" />حافظ على تركيزك، والتقدم الخارجي بيتسجل بإيدك فقط.</div></aside>; }
