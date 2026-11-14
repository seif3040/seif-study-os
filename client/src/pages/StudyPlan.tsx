import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { completionToast, errorText, money } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronLeft, Folder, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Plan = NonNullable<ReturnType<typeof trpc.studyPlan.list.useQuery>["data"]>;
type Row = Plan["rows"][number];
type Lesson = NonNullable<Row["lesson"]> & { progress: Row["progress"] };
type Chapter = NonNullable<Row["chapter"]> & { lessons: Lesson[] };
type Subject = Row["subject"] & { chapters: Map<number, Chapter> };

type Editor =
  | { kind: "subject"; item?: Subject }
  | { kind: "chapter"; subjectId: number; item?: Chapter }
  | { kind: "lesson"; chapterId: number; item?: Lesson };

const labels = { subject: "مادة", chapter: "فصل", lesson: "درس" };

function organize(rows: Plan["rows"]) {
  const subjects = new Map<number, Subject>();
  for (const row of rows) {
    let subject = subjects.get(row.subject.id);
    if (!subject) {
      subject = { ...row.subject, chapters: new Map() };
      subjects.set(subject.id, subject);
    }
    if (!row.chapter) continue;
    let chapter = subject.chapters.get(row.chapter.id);
    if (!chapter) {
      chapter = { ...row.chapter, lessons: [] };
      subject.chapters.set(chapter.id, chapter);
    }
    if (row.lesson) chapter.lessons.push({ ...row.lesson, progress: row.progress });
  }
  return subjects;
}

export default function StudyPlan() {
  const utils = trpc.useUtils();
  const planner = trpc.planner.list.useQuery();
  const { data, isLoading, isError, refetch } = trpc.studyPlan.list.useQuery();
  const [subjectId, setSubjectId] = useState<number>();
  const [chapterId, setChapterId] = useState<number>();
  const [editor, setEditor] = useState<Editor>();
  const invalidate = () => Promise.all([
    utils.studyPlan.list.invalidate(),
    utils.planner.list.invalidate(),
    utils.dashboard.summary.invalidate(),
    utils.analytics.overview.invalidate(),
    utils.achievements.list.invalidate(),
    utils.exams.list.invalidate(),
  ]);

  if (isLoading) return <div className="h-72 animate-pulse rounded-2xl bg-muted" />;
  if (isError) return <div className="surface space-y-3 p-5" role="alert">
    <p>تعذّر تحميل خطة المذاكرة.</p>
    <Button variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button>
  </div>;

  const subjects = organize(data?.rows ?? []);
  const subject = subjectId === undefined ? undefined : subjects.get(subjectId);
  const chapter = chapterId === undefined ? undefined : subject?.chapters.get(chapterId);
  const openSubjects = () => { setSubjectId(undefined); setChapterId(undefined); };
  const add = () => setEditor(chapter ? { kind: "lesson", chapterId: chapter.id }
    : subject ? { kind: "chapter", subjectId: subject.id } : { kind: "subject" });
  const action = chapter ? "درس جديد" : subject ? "فصل جديد" : "مادة جديدة";

  return (
    <div>
      {subject && <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="مسار خطة المنهج">
        <button className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={openSubjects}>المواد</button>
        <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
        {chapter ? <>
          <button className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setChapterId(undefined)}>{subject.title}</button>
          <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-semibold" aria-current="page">{chapter.title}</span>
        </> : <span className="font-semibold" aria-current="page">{subject.title}</span>}
      </nav>}
      <PageHeader title={chapter?.title ?? subject?.title ?? "خطة المنهج"}
        description={chapter ? (subject?.title ?? "دروس الفصل") : subject ? "فصول المادة" : "اختار مادة عشان تفتح فصولها ودروسها."} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={add}><Plus />{action}</Button>
        {subject && <Button variant="outline" onClick={chapter ? () => setChapterId(undefined) : openSubjects}>
          <ArrowLeft className="rotate-180" />{chapter ? "رجوع للفصول" : "رجوع للمواد"}
        </Button>}
      </div>

      {!subject && (subjects.size ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...subjects.values()].map(item => {
          const lessons = [...item.chapters.values()].flatMap(part => part.lessons);
          return <FolderCard key={item.id} title={item.title} color={item.color}
            count={money.format(item.chapters.size) + " فصل"}
            lessons={lessons}
            onOpen={() => { setSubjectId(item.id); setChapterId(undefined); }}
            onEdit={() => setEditor({ kind: "subject", item })} />;
        })}
      </div> : <EmptyState title="لسه مفيش مواد" description="اضغط «مادة جديدة» عشان تبدأ." />)}

      {subject && !chapter && (subject.chapters.size ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[...subject.chapters.values()].map(item => <FolderCard key={item.id} title={item.title} color={subject.color}
          lessons={item.lessons}
          onOpen={() => setChapterId(item.id)}
          onEdit={() => setEditor({ kind: "chapter", subjectId: subject.id, item })} />)}
      </div> : <EmptyState title="لسه مفيش فصول" description="اضغط «فصل جديد» عشان تضيف أول فصل للمادة." />)}

      {chapter && (chapter.lessons.length ? <div className="surface divide-y overflow-hidden">
        {chapter.lessons.map(lesson => <LessonRow key={lesson.id} lesson={lesson} marked={lesson.progress?.status !== "completed" && (planner.data?.backlog?.includes(lesson.id) ?? false)} onDone={invalidate}
          onEdit={() => setEditor({ kind: "lesson", chapterId: chapter.id, item: lesson })} />)}
      </div> : <EmptyState title="لسه مفيش دروس" description="اضغط «درس جديد» عشان تضيف أول درس للفصل." />)}

      {editor && <ResourceEditor editor={editor} onClose={() => setEditor(undefined)} onDone={invalidate} />}
    </div>
  );
}

function FolderCard({ title, color, count, lessons, onOpen, onEdit }: {
  title: string; color: string; count?: string; lessons: Lesson[]; onOpen: () => void; onEdit: () => void;
}) {
  const completed = lessons.filter(lesson => lesson.progress?.status === "completed").length;
  const percent = lessons.length ? Math.round(completed * 100 / lessons.length) : 0;
  return <article className="surface overflow-hidden transition-colors hover:border-primary/40">
    <button type="button" onClick={onOpen} className="flex w-full flex-col items-start gap-4 p-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
      <span className="flex w-full items-center justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary" style={{ color }}><Folder className="size-7" aria-hidden /></span>
        <ChevronLeft className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span>
        <span className="block text-lg font-bold">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{[count, money.format(lessons.length) + " درس"].filter(Boolean).join(" · ")}</span>
      </span>
      {lessons.length > 0 && <span className="w-full space-y-2">
        <span className="flex justify-between text-xs text-muted-foreground"><span>مكتمل {money.format(completed)} من {money.format(lessons.length)}</span><span>{money.format(percent)}٪</span></span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-primary/15" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: percent + "%" }} /></span>
      </span>}
    </button>
    <div className="flex gap-1 border-t px-3 py-2"><ResourceButtons title={title} onEdit={onEdit} /></div>
  </article>;
}

function ResourceButtons({ title, onEdit }: { title: string; onEdit: () => void }) {
  return <>
    <Button size="sm" variant="ghost" aria-label={"تعديل " + title} onClick={onEdit}><Pencil className="size-4" />تعديل</Button>
  </>;
}

function LessonRow({ lesson, marked, onDone, onEdit }: { lesson: Lesson; marked: boolean; onDone: () => Promise<unknown>; onEdit: () => void }) {
  const complete = trpc.studyPlan.complete.useMutation({
    onSuccess: async result => { completionToast(result, 75); await onDone(); },
    onError: error => toast.error(errorText(error)),
  });
  const review = trpc.studyPlan.review.useMutation({
    onSuccess: async result => { completionToast(result, 15); await onDone(); },
    onError: error => toast.error(errorText(error)),
  });
  const reopen = trpc.studyPlan.reopen.useMutation({ onSuccess: onDone, onError: error => toast.error(errorText(error)) });
  const backlog = trpc.planner.markBacklog.useMutation({ onSuccess: onDone, onError: error => toast.error(errorText(error)) });
  const status = lesson.progress?.status ?? "not_started";
  return <article className="space-y-3 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {status === "completed" ? <CheckCircle2 className="size-5" /> : <BookOpen className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="break-words font-bold">{lesson.title}</h2>
        <p className="text-sm text-muted-foreground">{money.format(lesson.estimatedMinutes)} دقيقة</p>
      </div>
      <Badge variant={status === "completed" ? "default" : "secondary"}>
        {marked ? "متراكم" : status === "completed" ? "مكتمل" : status === "in_progress" ? "قيد الدراسة" : "لم يبدأ"}
      </Badge>
    </div>
    {lesson.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lesson.description}</p>}
    {lesson.notes && <details className="rounded-lg bg-muted/50 p-3 text-sm">
      <summary className="cursor-pointer font-medium">الملاحظات</summary>
      <p className="mt-2 whitespace-pre-wrap">{lesson.notes}</p>
    </details>}
    {(lesson.progress?.progress ?? 0) > 0 && <Progress value={lesson.progress?.progress ?? 0} className="h-1.5" aria-label="تقدّم الدرس" />}
    <div className="flex flex-wrap items-center gap-2">
      {status === "completed"
        ? <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ lessonId: lesson.id })}><RefreshCw />مراجعة</Button>
        : <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate({ lessonId: lesson.id })}><CheckCircle2 />إكمال</Button>}
      <Button size="sm" variant="outline" disabled={backlog.isPending} onClick={() => backlog.mutate({ lessonIds: [lesson.id], marked: !marked })}>
        {marked ? "شيل من المتراكم" : "علّم كمتراكم"}
      </Button>
      {status === "completed" && <Button size="sm" variant="outline" disabled={reopen.isPending}
        onClick={() => reopen.mutate({ lessonId: lesson.id })}>إلغاء الإكمال</Button>}
      <ResourceButtons title={lesson.title} onEdit={onEdit} />
    </div>
  </article>;
}

function ResourceEditor({ editor, onClose, onDone }: { editor: Editor; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [title, setTitle] = useState(editor.item?.title ?? "");
  const [color, setColor] = useState(editor.kind === "subject" ? editor.item?.color ?? "#10B981" : "#10B981");
  const [description, setDescription] = useState(editor.kind === "lesson" ? editor.item?.description ?? "" : "");
  const [notes, setNotes] = useState(editor.kind === "lesson" ? editor.item?.notes ?? "" : "");
  const [minutes, setMinutes] = useState(editor.kind === "lesson" ? String(editor.item?.estimatedMinutes ?? 30) : "30");
  const [saving, setSaving] = useState(false);
  const createSubject = trpc.studyPlan.createSubject.useMutation();
  const updateSubject = trpc.studyPlan.updateSubject.useMutation();
  const createChapter = trpc.studyPlan.createChapter.useMutation();
  const updateChapter = trpc.studyPlan.updateChapter.useMutation();
  const createLesson = trpc.studyPlan.createLesson.useMutation();
  const updateLesson = trpc.studyPlan.updateLesson.useMutation();
  const duration = Number(minutes);
  const valid = !!title.trim() && (editor.kind !== "lesson" || (Number.isInteger(duration) && duration >= 5 && duration <= 600));
  const maxLength = editor.kind === "subject" ? 160 : editor.kind === "chapter" ? 180 : 200;
  const formTitle = (editor.item ? "تعديل " : "إضافة ") + labels[editor.kind];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const name = title.trim();
    try {
      if (editor.kind === "subject") {
        if (editor.item) await updateSubject.mutateAsync({ subjectId: editor.item.id, title: name, color });
        else await createSubject.mutateAsync({ title: name, color });
      } else if (editor.kind === "chapter") {
        if (editor.item) await updateChapter.mutateAsync({ chapterId: editor.item.id, title: name });
        else await createChapter.mutateAsync({ subjectId: editor.subjectId, title: name });
      } else {
        const fields = { title: name, estimatedMinutes: duration, description: description || undefined, notes: notes || undefined };
        if (editor.item) await updateLesson.mutateAsync({ lessonId: editor.item.id, ...fields });
        else await createLesson.mutateAsync({ chapterId: editor.chapterId, ...fields });
      }
    } catch (error) {
      toast.error(errorText(error));
      setSaving(false);
      return;
    }
    toast.success("تم الحفظ.");
    onClose();
    await onDone();
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{formTitle}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={save}>
        <label className="block space-y-1"><span>الاسم</span><Input value={title} maxLength={maxLength} required onChange={e => setTitle(e.target.value)} /></label>
        {editor.kind === "subject" && <label className="flex items-center justify-between gap-2"><span>لون المجلد</span><input type="color" className="h-9 w-16 cursor-pointer rounded border bg-background" value={color} onChange={e => setColor(e.target.value)} /></label>}
        {editor.kind === "lesson" && <>
          <label className="block space-y-1"><span>المدة بالدقائق</span><Input type="number" value={minutes} min={5} max={600} step={1} required onChange={e => setMinutes(e.target.value)} /></label>
          <label className="block space-y-1"><span>الوصف</span><Textarea value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} /></label>
          <label className="block space-y-1"><span>الملاحظات</span><Textarea value={notes} maxLength={8000} onChange={e => setNotes(e.target.value)} /></label>
        </>}
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>إلغاء</Button><Button type="submit" disabled={!valid || saving}>حفظ</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

