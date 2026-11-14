import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { BrainCircuit, CheckCircle2, FileQuestion, GraduationCap, Pencil, Plus, Trash2, Target } from "lucide-react";
import { toast } from "sonner";

export default function Exams() {
  const utils = trpc.useUtils(); const { data, isLoading } = trpc.exams.list.useQuery(); const { data: plan } = trpc.studyPlan.list.useQuery();
  const invalidate = () => Promise.all([utils.exams.list.invalidate(), utils.dashboard.summary.invalidate(), utils.analytics.overview.invalidate(), utils.coins.ledger.invalidate(), utils.achievements.list.invalidate()]);
  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  const active = data?.filter(item => !item.exam.archivedAt) ?? [];
  const archived = data?.filter(item => item.exam.archivedAt) ?? [];
  return <div><PageHeader title="الامتحانات" description="حدّد الدروس التي يغطيها كل امتحان ليحسب الموقع مدى جاهزيتك من الإكمال والمراجعة الفعليين." action={{ label: "امتحان جديد", onClick: () => document.getElementById("exam-trigger")?.click() }} /><CreateExam plan={plan} onDone={invalidate} />{!active.length ? <EmptyState title="لا توجد امتحانات مسجلة" description="أضف امتحانًا ثم اختر دروسه لتحصل على تقدير واضح لمدى الجاهزية." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(item => <ExamCard key={item.exam.id} item={item} plan={plan} onDone={invalidate} />)}</div>}{archived.length > 0 && <details className="surface mt-5 p-4"><summary className="cursor-pointer font-bold">الامتحانات المؤرشفة ({archived.length})</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{archived.map(item => <ExamCard key={item.exam.id} item={item} plan={plan} onDone={invalidate} />)}</div></details>}</div>;
}

function ExamCard({ item, plan, onDone }: { item: any; plan: any; onDone: () => Promise<any> }) {
  const [open, setOpen] = useState(false), [reviewOpen, setReviewOpen] = useState(false), [total, setTotal] = useState(String(item.exam.quizPayload?.questions?.length ?? 10)), [correct, setCorrect] = useState("0"), [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium"), [result, setResult] = useState<any>(null);
  const mutation = trpc.exams.completeAttempt.useMutation({ onSuccess: async r => { setResult(r); toast.success(`تم تسجيل النتيجة: ${r.score}% — الاستيعاب ${r.comprehensionScore}%`); await onDone(); }, onError: e => toast.error(errorText(e)) });
  const reviewMutation = trpc.notebooks.markQuizReviewed.useMutation({ onSuccess: () => onDone(), onError: e => toast.error(errorText(e)) });
  const readiness = item.readiness; const weak = readiness?.weakLessons ?? []; const quiz = item.exam.quizPayload; const notebookQuiz = item.exam.origin === "notebook_ai" && quiz?.questions?.length;
  return <div className="surface p-5"><div className="mb-5 flex items-start justify-between"><span className="metric-icon bg-sky-100 text-sky-700"><GraduationCap /></span><Badge variant="secondary">{notebookQuiz ? "Notebook AI · من ملفاتك" : item.subject || "امتحان محدد الدروس"}</Badge></div><h2 className="font-bold">{item.exam.title}</h2><p className="mt-1 text-sm text-muted-foreground">{notebookQuiz ? `${quiz.questions.length} أسئلة محفوظة للمراجعة` : item.exam.scheduledAt ? `موعده ${examTime.format(new Date(item.exam.scheduledAt))}` : "اختبار مرن"}</p>
    <div className="mt-4 rounded-xl bg-primary/5 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Target className="size-4 text-primary" /><p className="text-sm font-bold">مدى جاهزيتك</p></div><b className="font-[Manrope] text-2xl text-primary">{readiness?.score ?? 0}%</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${readiness?.score ?? 0}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{readiness?.level ?? "أضف الدروس أولًا"} · مكتمل {readiness?.completed ?? 0}/{item.lessons?.length ?? 0} · مُراجع {readiness?.reviewed ?? 0}/{item.lessons?.length ?? 0}</p></div>
    {notebookQuiz ? <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900"><p className="font-bold">المصادر: {quiz.sourceNames?.join("، ") || "ملفات Notebook AI"}</p><p className="mt-1 leading-5">الأسئلة والإجابات محفوظة هنا من الملفات التي رفعتها وقت الإنشاء.</p><p className="mt-2 font-semibold">{item.exam.quizReviewedAt ? "تمت المراجعة" : "لسه ما اتراجعش"}</p></div> : item.lessons?.length ? <div className="mt-4"><p className="mb-2 text-xs font-bold text-muted-foreground">دروس الامتحان ({item.lessons.length})</p><div className="space-y-2">{item.lessons.map((lesson: any) => <div key={`${lesson.subjectTitle}-${lesson.title}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{lesson.title}</span><span className={lesson.status === "completed" && lesson.lastReviewedAt ? "text-emerald-600" : "text-amber-600"}>{lesson.status === "completed" && lesson.lastReviewedAt ? "مكتمل ومراجع" : lesson.status === "completed" ? "يحتاج مراجعة" : "غير مكتمل"}</span></div>)}</div>{weak.length > 0 && <p className="mt-3 text-xs text-amber-700">ركّز قبل الامتحان على: {weak.slice(0, 2).map((lesson: any) => lesson.title).join("، ")}{weak.length > 2 ? "…" : ""}</p>}</div> : <p className="mt-4 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">هذا الامتحان لم تُضف له دروس بعد، لذلك لا يمكن تقدير الجاهزية بدقة.</p>}
    <ExamActions item={item} plan={plan} onDone={onDone} />
    {item.attempts.length > 0 && <details className="mt-4 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">سجل المحاولات ({item.attempts.length})</summary><ul className="mt-3 space-y-2 text-sm">{item.attempts.map((attempt: { id: number; date: Date | string; score: number; comprehension: number }) => <li key={attempt.id} className="flex flex-wrap gap-x-3 gap-y-1"><time>{new Date(attempt.date).toLocaleDateString("ar-EG")}</time><span>النتيجة {attempt.score}%</span><span>الاستيعاب {attempt.comprehension}%</span></li>)}</ul></details>}
    {result && <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-primary/5 p-3 text-center"><div><p className="text-xs text-muted-foreground">النتيجة</p><p className="font-[Manrope] text-xl font-extrabold text-primary">{result.score}%</p></div><div><p className="text-xs text-muted-foreground">الاستيعاب</p><p className="font-[Manrope] text-xl font-extrabold text-primary">{result.comprehensionScore}%</p></div></div>}
    {!item.exam.archivedAt && notebookQuiz && <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogTrigger asChild><Button variant="outline" className="mt-5 w-full" onClick={() => reviewMutation.mutate({ examId: item.exam.id })}><FileQuestion />افتح الامتحان للمراجعة</Button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{item.exam.title}</DialogTitle></DialogHeader><div className="space-y-3">{quiz.questions.map((question: any, index: number) => <details key={`${item.exam.id}-${index}`} className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{index + 1}. {question.question}</summary><p className="mt-3 border-t pt-3 text-sm leading-6 text-muted-foreground"><b className="text-foreground">الإجابة:</b> {question.answer}</p></details>)}</div><DialogFooter><Button onClick={() => setReviewOpen(false)}>رجوع للامتحانات</Button></DialogFooter></DialogContent></Dialog>}
    {!item.exam.archivedAt && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="mt-3 w-full"><BrainCircuit />تسجيل محاولة</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>تسجيل محاولة: {item.exam.title}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3"><Input type="number" min="1" value={total} onChange={e => setTotal(e.target.value)} placeholder="عدد الأسئلة" /><Input type="number" min="0" value={correct} onChange={e => setCorrect(e.target.value)} placeholder="الإجابات الصحيحة" /></div><select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="h-10 rounded-md border bg-background px-3"><option value="easy">سهل</option><option value="medium">متوسط</option><option value="hard">صعب</option></select><Input placeholder="موضوعات أخطأت بها، مفصولة بفواصل" id={`topics-${item.exam.id}`} /><DialogFooter><Button disabled={mutation.isPending} onClick={() => { const topics = (document.getElementById(`topics-${item.exam.id}`) as HTMLInputElement)?.value.split(",").map(x => x.trim()).filter(Boolean) ?? []; mutation.mutate({ examId: item.exam.id, totalQuestions: Number(total), correctAnswers: Number(correct), difficulty, missedTopics: topics }); }}>حلل الاستيعاب<BrainCircuit /></Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}

type Scope = { subjectId: number; chapterId: number; lessonIds: number[]; full: boolean };
const emptyScope: Scope = { subjectId: 0, chapterId: 0, lessonIds: [], full: true };
const selectClass = "block h-10 w-full rounded-md border bg-background px-2";
const examTime = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", hour12: true });
function localExamDate(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(+date - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function ExamScopeFields({ plan, scope, onChange }: { plan: any; scope: Scope; onChange(scope: Scope): void }) {
  const rows: any[] = plan?.rows ?? [];
  const subjects = Array.from(new Map<number, string>(rows.map(row => [row.subject.id, row.subject.title])));
  const chapters = Array.from(new Map<number, string>(rows.filter(row => row.subject.id === scope.subjectId && row.chapter)
    .map(row => [row.chapter.id, row.chapter.title])));
  const lessons = rows.filter(row => row.chapter?.id === scope.chapterId && row.lesson);
  return <div className="space-y-3">
    <label className="block">المادة<select className={selectClass} value={scope.subjectId} onChange={e => onChange({ ...emptyScope, subjectId: Number(e.target.value) })}>
      <option value={0}>اختار المادة</option>
      {subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select></label>
    {scope.subjectId > 0 && <label className="block">نطاق الامتحان<select className={selectClass} value={scope.chapterId} onChange={e => onChange({ ...scope, chapterId: Number(e.target.value), full: true, lessonIds: [] })}>
      <option value={0}>شامل المادة</option>
      {chapters.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select></label>}
    {scope.chapterId > 0 && <fieldset className="space-y-2 rounded-xl border p-3">
      <label className="flex gap-2"><input type="checkbox" checked={scope.full} onChange={e => onChange({ ...scope, full: e.target.checked, lessonIds: [] })} /> شامل الفصل كله</label>
      {!scope.full && <div className="max-h-48 space-y-2 overflow-auto">{lessons.map(({ lesson }) =>
        <label key={lesson.id} className="flex gap-2"><input type="checkbox" checked={scope.lessonIds.includes(lesson.id)}
          onChange={e => onChange({ ...scope, lessonIds: e.target.checked ? [...scope.lessonIds, lesson.id] : scope.lessonIds.filter(id => id !== lesson.id) })} />{lesson.title}</label>)}</div>}
    </fieldset>}
  </div>;
}

function examScopeInput(scope: Scope, plan: any) {
  const lessonIds: number[] = scope.full ? (plan?.rows ?? []).flatMap((row: any) =>
    row.subject.id === scope.subjectId && (!scope.chapterId || row.chapter?.id === scope.chapterId) && row.lesson ? [row.lesson.id] : [])
    : scope.lessonIds;
  return { subjectId: scope.subjectId || undefined, chapterId: scope.chapterId || undefined, lessonIds };
}
function ExamDateFields({ value, setValue }: { value: string; setValue(value: string): void }) {
  return <div className="grid grid-cols-2 gap-2">
    <label>التاريخ<Input type="date" value={value.slice(0, 10)} onChange={e => setValue(e.target.value ? e.target.value + "T" + (value.slice(11) || "12:00") : "")} /></label>
    <label>الساعة<Input type="time" disabled={!value} required={Boolean(value)} value={value.slice(11)} onChange={e => setValue(value.slice(0, 11) + e.target.value)} /></label>
  </div>;
}
function CreateExam({ onDone, plan }: { onDone: () => Promise<unknown>; plan: any }) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(""), [date, setDate] = useState("");
  const [scope, setScope] = useState(emptyScope);
  const mutation = trpc.exams.create.useMutation({
    onSuccess: async () => { setOpen(false); setTitle(""); setDate(""); setScope(emptyScope); await onDone(); toast.success("اتضاف الامتحان."); },
    onError: e => toast.error(errorText(e)),
  });
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger id="exam-trigger" asChild><span /></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>امتحان جديد</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        mutation.mutate({ title: title.trim() || (scope.full ? "امتحان شامل" : "امتحان") + " · " + (plan?.rows ?? []).find((row: any) => row.subject.id === scope.subjectId)?.subject.title,
          scheduledAt: date ? new Date(date) : undefined, ...examScopeInput(scope, plan) });
      }}>
        <ExamDateFields value={date} setValue={setDate} />
        <ExamScopeFields plan={plan} scope={scope} onChange={setScope} />
        <label>اسم الامتحان (اختياري)<Input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label>
        <DialogFooter><Button type="submit" disabled={!scope.subjectId || (!scope.full && !scope.lessonIds.length) || mutation.isPending}><Plus />إضافة الامتحان</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function ExamActions({ item, plan, onDone }: { item: any; plan: any; onDone: () => Promise<unknown> }) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [scope, setScope] = useState(emptyScope);
  const [changedLessons, setChangedLessons] = useState(false);
  const originalDate = localExamDate(item.exam.scheduledAt);
  const update = trpc.exams.update.useMutation({
    onSuccess: async () => { setEditOpen(false); toast.success("تم حفظ التعديل."); await onDone(); },
    onError: error => toast.error(errorText(error)),
  });
  const archive = trpc.exams.setArchived.useMutation({
    onSuccess: async (_, input) => {
      setArchiveOpen(false);
      toast.success(input.archived ? "الامتحان اتنقل للأرشيف." : "الامتحان رجع للقائمة.");
      await onDone();
    },
    onError: error => toast.error(errorText(error)),
  });
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild><Button size="sm" variant="outline" onClick={() => {
          setTitle(item.exam.title);
          setDate(originalDate);
          setScope(emptyScope);
          setChangedLessons(false);
        }}><Pencil /> تعديل الامتحان</Button></DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل الامتحان</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            if (!title.trim() || update.isPending) return;
            update.mutate({ examId: item.exam.id, title: title.trim(), scheduledAt: date === originalDate ? undefined : date ? new Date(date) : null, ...(changedLessons ? { ...examScopeInput(scope, plan), chapterId: scope.chapterId || null } : {}) });
          }}>
            <label className="block space-y-1"><span>اسم الامتحان</span><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required /></label>
            <ExamDateFields value={date} setValue={setDate} />
            <details><summary className="cursor-pointer">تغيير نطاق الامتحان</summary>
              <ExamScopeFields plan={plan} scope={scope} onChange={value => { setScope(value); setChangedLessons(true); }} />
            </details>
            <DialogFooter><Button type="submit" disabled={!title.trim() || update.isPending || (changedLessons && (!scope.subjectId || (!scope.full && !scope.lessonIds.length)))}>حفظ التعديل</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {item.exam.archivedAt ? <Button size="sm" variant="outline" disabled={archive.isPending} onClick={() => archive.mutate({ examId: item.exam.id, archived: false })}>استرجاع الامتحان</Button> :
        <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Trash2 /> إزالة الامتحان</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إزالة «{item.exam.title}»؟</DialogTitle></DialogHeader>
            <p>الامتحان ومحاولاته هيفضلوا محفوظين، وتقدر تسترجعه من الامتحانات المؤرشفة.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveOpen(false)}>إلغاء</Button>
              <Button variant="destructive" disabled={archive.isPending} onClick={() => archive.mutate({ examId: item.exam.id, archived: true })}>نقل للأرشيف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
    </div>
  );
}
