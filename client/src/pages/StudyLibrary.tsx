import MistakeExam from "@/components/MistakeExam";
import { printBooklet, readBooklets, type Booklet } from "@/lib/mistakeBooklet";
import { useAuth } from "@/_core/hooks/useAuth";
import MistakeQuestionForm from "@/components/MistakeQuestionForm";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { StudyResources } from "@shared/studyResources";
import { PlatformLink } from "@/components/PlatformWorkspace";
import { safeStudyUrl } from "@/lib/videoSources";
import ActionDialog from "@/components/ActionDialog";
import { useState } from "react";
import { BookOpen, ClipboardList, CalendarDays, Pencil, Trash2, Printer, FileCheck, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { bookBacklogLessons, buildYearReviews, yearReviewDate, type BookBacklogMode } from "@shared/studyResources";
import { plannerToday } from "@shared/studyPlanner";

const select = "h-10 w-full rounded-md border bg-background px-2";
const fields = (form: HTMLFormElement) => new FormData(form);
const str = (form: FormData, key: string) => String(form.get(key) ?? "");

const backlogModes: Record<BookBacklogMode, string> = {
  automatic: "تلقائي للمادة كلها",
  branches: "تلقائي حسب الفروع والوحدات",
  manual: "تحديد يدوي",
};

const sectionDescriptions = {
  "الكتب": "تابع تقدّم الحل والدروس المتراكمة لكل كتاب.",
  "الواجبات": "شوف المطلوب تسليمه ومواعيده، وسجّل صفحات الواجب لكل درس.",
  "كشكول الأخطاء": "راجع الأسئلة اللي غلطت فيها وسجّل أسئلة جديدة.",
  "مراجعة آخر السنة": "شوف مواعيد مراجعة المواد ونطاق الدروس في كل جلسة.",
} as const;

export default function StudyLibrary({ attendanceLessons, attendanceSourceId, section = "الكتب" }: {
  attendanceLessons?: number[];
  attendanceSourceId?: number;
  section?: keyof typeof sectionDescriptions;
} = {}) {
  const planner = trpc.planner.list.useQuery();
  const sources = trpc.lessonSources.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const [attendanceTab, setAttendanceTab] = useState<"الكتب" | "الواجبات">("الواجبات");
  const tab = attendanceLessons ? attendanceTab : section;
  const [bookFormOpen, setBookFormOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState(0);
  const [subject, setSubject] = useState(0);
  const [teacher, setTeacher] = useState(attendanceSourceId ?? 0);
  const [platform, setPlatform] = useState("");
  const [website, setWebsite] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [homeworkSubject, setHomeworkSubject] = useState(0);
  const [homeworkChapter, setHomeworkChapter] = useState(0);
  const [homeworkKind, setHomeworkKind] = useState<"book" | "online">("book");
  const [bookId, setBookId] = useState("");
  const [editHomework, setEditHomework] = useState("");
  const [homeworkFormOpen, setHomeworkFormOpen] = useState(false);
  const [mistakeForm, setMistakeForm] = useState<{ question?: StudyResources["mistakes"][number] }>();
  const [deleteQuestion, setDeleteQuestion] = useState<StudyResources["mistakes"][number]>();
  const assignedTasks = trpc.tasks.list.useQuery(undefined, { enabled: tab === "الواجبات" });
  const reopenHomework = trpc.tasks.reopen.useMutation({ onSuccess: () => utils.invalidate(), onError: error => toast.error(errorText(error)) });
  const completeHomework = trpc.tasks.complete.useMutation({
    onSuccess: async () => { await utils.invalidate(); },
    onError: error => toast.error(errorText(error)),
  });
  const [editBook, setEditBook] = useState("");
  const [through, setThrough] = useState<number | null>(null);
  const [backlogMode, setBacklogMode] = useState<BookBacklogMode>("automatic");
  const [branchThrough, setBranchThrough] = useState<Record<string, number>>({});
  const [manualBacklog, setManualBacklog] = useState<number[]>([]);
  const [examMode, setExamMode] = useState<"setup" | "online" | "paper">();
  const [examSubject, setExamSubject] = useState("");
  const { user } = useAuth();
  const bookletKey = "seif-mistake-booklets-" + user?.id;
  const change = trpc.planner.saveStudyResource.useMutation({
    onSuccess: async (_, entry) => {
      await Promise.all([utils.planner.list.invalidate(), utils.tasks.list.invalidate(), utils.dashboard.summary.invalidate(), utils.calendar.list.invalidate(), utils.coins.ledger.invalidate()]);
      if (entry.type === "book") setBookFormOpen(false);
      if (entry.type === "homework") closeHomework();
      if (entry.type === "mistake") setMistakeForm(undefined);
      if (entry.type === "deleteMistake") setDeleteQuestion(undefined);
      toast.success(entry.type === "deleteMistake" ? "السؤال اتمسح." : "اتحفظ.");
    },
    onError: error => toast.error(errorText(error)),
  });
  if (!plan.data || !planner.data) return <p>{plan.isError || planner.isError ? "تعذّر تحميل مكتبتك." : "جارٍ تحميل المكتبة…"}</p>;
  const resources = planner.data.resources;
  const rows = plan.data.rows;
  const subjects = Array.from(new Map(rows.map(row => [row.subject.id, row.subject.title])));
  const books = resources?.books ?? [];
  const book = books.find(item => item.id === editBook);
  const bookBacklog = bookBacklogLessons({ subjectId: subject, through, backlogMode, branchThrough, backlog: manualBacklog,
    solvedLessonIds: book?.subjectId === subject ? book.solvedLessonIds : undefined }, rows);
  const assignment = resources?.homework.find(item => item.id === editHomework);
  const homeworkBook = books.find(item => item.id === bookId);
  const items = rows.filter(row => row.subject.id === (tab === "الواجبات" ? homeworkBook?.subjectId : subject) && row.lesson && (tab !== "الواجبات" || !attendanceLessons || attendanceLessons.includes(row.lesson.id)));
  const branches = Array.from(new Map(items.flatMap(row => row.chapter ? [[row.chapter.id, row.chapter] as const] : [])).values());
  const visibleLessons = new Set(items.map(row => row.lesson?.id));
  const questions = resources?.mistakes ?? [];
  const examSubjectCounts = new Map<number, number>();
  for (const question of questions) {
    examSubjectCounts.set(question.subjectId, (examSubjectCounts.get(question.subjectId) ?? 0) + 1);
  }
  const examQuestions = examSubject === "all" ? questions
    : questions.filter(question => String(question.subjectId) === examSubject);
  function exportMistakes() {
    const booklet: Booklet = {
      code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      date: plannerToday(),
      questions: questions.map(({ id, subjectId, lessonId, question, kind, options, answer }) =>
        ({ id, subjectId, lessonId, question, kind, options, answer })),
    };
    try {
      localStorage.setItem(bookletKey, JSON.stringify([booklet, ...readBooklets(bookletKey)]));
    } catch {
      toast.error("مساحة المتصفح مش كفاية لحفظ نسخة الملزمة للتصحيح.");
      return;
    }
    toast.info("اختار حفظ كـ PDF من نافذة الطباعة.");
    printBooklet(booklet);
  }
  const attendanceRows = attendanceLessons ? rows.filter(row => row.lesson && attendanceLessons.includes(row.lesson.id)) : [];
  const homeworkSubjectId = homeworkKind === "book" ? homeworkBook?.subjectId
    : attendanceRows[0]?.subject.id ?? homeworkSubject;
  const subjectLessons = rows.filter(row => row.lesson && row.subject.id === homeworkSubjectId
    && (!attendanceLessons || attendanceLessons.includes(row.lesson.id)));
  const homeworkChapters = Array.from(new Map(subjectLessons.flatMap(row =>
    row.chapter ? [[row.chapter.id, row.chapter.title] as const] : [])));
  const chapterId = homeworkChapter || (homeworkChapters.length === 1 ? homeworkChapters[0][0] : 0);
  const homeworkRows = subjectLessons.filter(row => row.chapter?.id === chapterId);
  const lessonOptions = homeworkRows.map(row => <option value={row.lesson!.id} key={row.lesson!.id}>{row.chapter?.title} · {row.lesson!.title}</option>);
  const openBook = (item?: (typeof books)[number]) => {
    const chapterId = rows.find(row => row.lesson?.id === item?.through)?.chapter?.id;
    setEditBook(item?.id ?? "");
    setSubject(item?.subjectId ?? 0);
    setThrough(item?.through ?? null);
    setBacklogMode(item?.backlogMode ?? "automatic");
    setBranchThrough(item?.branchThrough ?? (chapterId && item?.through ? { [chapterId]: item.through } : {}));
    setManualBacklog(item?.backlog ?? []);
    setBookFormOpen(true);
  };
  function closeHomework() { setTeacher(attendanceSourceId ?? 0); setPlatform(""); setWebsite(""); setSiteUrl(""); setHomeworkFormOpen(false); setEditHomework(""); setBookId(""); setHomeworkKind("book"); setHomeworkSubject(0); setHomeworkChapter(0); }
  const homeworkForm = (
      <form key={editHomework} className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        const details = { id: editHomework || crypto.randomUUID(), lessonId: Number(str(form, "lesson")), prompt: str(form, "prompt") };
        change.mutate({ type: "homework", item: homeworkKind === "online"
          ? { ...details, kind: "online", platform, url: website, sourceId: teacher || undefined, rememberSite: form.has("rememberSite"), siteUrl: siteUrl || undefined }
          : { ...details, bookId, pages: str(form, "pages") } });
      }}>
        <label>نوع الواجب<select aria-label="نوع الواجب" value={homeworkKind} className={select} onChange={event => { setHomeworkKind(event.target.value === "online" ? "online" : "book"); setHomeworkChapter(0); }}>
          <option value="book">كتاب</option><option value="online">موقع أونلاين</option>
        </select></label>
        {homeworkKind === "book" ? <label>الكتاب<select required className={select} value={bookId} onChange={event => { setBookId(event.target.value); setHomeworkChapter(0); }}>
          <option value="">اختار الكتاب</option>{books.filter(item => !attendanceLessons || rows.some(row => row.subject.id === item.subjectId && row.lesson && attendanceLessons.includes(row.lesson.id))).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label> : <div className="grid gap-2 sm:grid-cols-2">
          <label>المدرس<select className={select} value={teacher || ""} onChange={event => setTeacher(Number(event.target.value))}>
            <option value="">اختار مدرس لو هتحفظ الموقع</option>
            {sources.data?.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.teacherName} · {item.subject}</option>)}
          </select></label>
          {teacher > 0 && <label>مواقع محفوظة<select className={select} value="" onChange={event => {
            const saved = planner.data?.savedHomeworkSites?.filter(item => item.sourceId === teacher)[Number(event.target.value)];
            if (saved) { setPlatform(saved.name); setWebsite(saved.url); setSiteUrl(saved.url); }
          }}><option value="" disabled>اختار موقع</option>
            {planner.data?.savedHomeworkSites?.filter(item => item.sourceId === teacher).map((item, index) => <option value={index} key={item.name}>{item.name}</option>)}
          </select></label>}
          <label>اسم المنصة<Input value={platform} onChange={event => setPlatform(event.target.value)} required maxLength={180} /></label>
          <label>لينك الواجب<Input type="url" dir="ltr" value={website} onChange={event => setWebsite(event.target.value)} required maxLength={2000} /></label>
          {teacher > 0 && <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="rememberSite" />احفظ الموقع للمدرس ده</label>
            <label className="block">الرابط الأساسي للموقع (اختياري)<Input type="url" dir="ltr" value={siteUrl} onChange={event => setSiteUrl(event.target.value)} maxLength={2000} /></label>
          </div>}
        </div>}
        {homeworkKind === "online" && (attendanceRows.length
          ? <p className="text-sm text-muted-foreground">المادة · {attendanceRows[0].subject.title}</p>
          : <label>المادة<select value={homeworkSubject || ""} required className={select}
              onChange={event => { setHomeworkSubject(Number(event.target.value)); setHomeworkChapter(0); }}>
              <option value="">اختار المادة</option>
              {subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select></label>)}
        <label>الفصل أو الفرع<select value={chapterId || ""} required disabled={!homeworkSubjectId} className={select}
          onChange={event => setHomeworkChapter(Number(event.target.value))}>
          <option value="">اختار الفصل أو الفرع</option>
          {homeworkChapters.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <label>الدرس<select key={[homeworkKind, homeworkSubjectId, chapterId].join(":")} name="lesson"
          defaultValue={homeworkRows.some(row => row.lesson?.id === assignment?.lessonId) ? assignment?.lessonId : homeworkRows.length === 1 ? homeworkRows[0].lesson?.id : ""}
          required disabled={!chapterId} className={select}><option value="">اختار الدرس</option>{lessonOptions}</select></label>
        {homeworkKind === "book" && <label>الصفحات<Input name="pages" defaultValue={assignment?.kind === "online" ? "" : assignment?.pages} placeholder="مثال ٣٥–٣٩" required maxLength={120} /></label>}
        <label>المطلوب بالضبط<Textarea name="prompt" defaultValue={assignment?.prompt} maxLength={900} /></label>
        <Button disabled={!chapterId || !homeworkRows.length || change.isPending}>احفظ واجب الدرس</Button>
      </form>
  );
  return <div className="space-y-4">
    {!attendanceLessons && <PageHeader title={section === "الكتب" ? "كتبي" : section} description={sectionDescriptions[section]}
      action={section === "الكتب" ? { label: "كتاب جديد", onClick: () => openBook() }
        : section === "الواجبات" ? { label: "سجّل واجب درس", onClick: () => setHomeworkFormOpen(true) }
        : section === "كشكول الأخطاء" ? { label: "ضيف سؤال", onClick: () => setMistakeForm({}) } : undefined}>
      {section === "كشكول الأخطاء" && <>
        <Button variant="outline" disabled={!questions.length} onClick={() => { setExamSubject(""); setExamMode("setup"); }}><GraduationCap /> ابدأ امتحان</Button>
        <Button variant="outline" disabled={!questions.length} onClick={exportMistakes}><Printer /> صدّر ملزمة PDF</Button>
        <Button variant="outline" onClick={() => setExamMode("paper")}><FileCheck /> صحّح ملزمة</Button>
      </>}
    </PageHeader>}
    {attendanceLessons && <p className="text-sm">سجّل كل واجب لوحده. اختار كتاب وصفحات، أو اكتب اسم الموقع ولينك الواجب، وبعد الحفظ ضيف الواجب اللي بعده.</p>}
    {attendanceLessons && <div className="flex flex-wrap gap-2">
      {(["الكتب", "الواجبات"] as const).map(item => <Button key={item} variant={item === tab ? "default" : "outline"} aria-pressed={item === tab} onClick={() => setAttendanceTab(item)}>{item}</Button>)}
    </div>}
    {tab === "مراجعة آخر السنة" && <YearReviewSchedule />}
    {tab === "الكتب" && <div className="space-y-4">
      {!attendanceLessons && <label className="block max-w-xs space-y-1 text-sm">المادة
        <select className={select} value={subjectFilter} onChange={event => setSubjectFilter(Number(event.target.value))}>
          <option value={0}>كل المواد</option>
          {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
      {attendanceLessons && <Button variant="outline" onClick={() => openBook()}>كتاب جديد</Button>}
      {bookFormOpen && <ActionDialog title={book ? "تعديل الكتاب" : "كتاب جديد"} pending={change.isPending} onClose={() => setBookFormOpen(false)}>
      <form key={editBook} className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        change.mutate({ type: "book", item: { id: book?.id ?? crypto.randomUUID(), title: str(form, "title"),
          subjectId: subject, through: visibleLessons.has(through ?? undefined) ? through : null, backlogMode,
          backlog: manualBacklog.filter(id => visibleLessons.has(id)),
          branchThrough: Object.fromEntries(Object.entries(branchThrough).filter(([, id]) => visibleLessons.has(id))) } });
      }}>
        <label>اسم الكتاب<Input name="title" required maxLength={180} defaultValue={book?.title} /></label>
        <label>المادة<select required className={select} value={subject || ""} onChange={event => { setSubject(Number(event.target.value)); setThrough(null); setBranchThrough({}); setManualBacklog([]); }}>
          <option value="">اختار المادة</option>{subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        {subject > 0 && <fieldset key={subject} className="space-y-3">
          <label className="block space-y-1">طريقة حساب المتراكم
            <select className={select} value={backlogMode} onChange={event => setBacklogMode(event.target.value as BookBacklogMode)}>
              {Object.entries(backlogModes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          {backlogMode === "automatic" && <label>حلّيت لحد درس<select name="through" className={select} value={through ?? ""} onChange={event => setThrough(Number(event.target.value) || null)}>
            <option value="">لسه مبدأتش فيه</option>{lessonOptions}
          </select></label>}
          {backlogMode === "branches" && <div className="grid gap-3 sm:grid-cols-2">
            {branches.map(branch => <label key={branch.id} className="block space-y-1 rounded-lg border p-3">
              <span className="block font-medium">{branch.title}</span>
              <span className="block text-sm text-muted-foreground">آخر درس محلول</span>
              <select className={select} value={branchThrough[branch.id] ?? ""} onChange={event => {
                const value = Number(event.target.value);
                setBranchThrough(previous => {
                  const next = { ...previous };
                  if (value) next[branch.id] = value;
                  else delete next[branch.id];
                  return next;
                });
              }}>
                <option value="">لسه مبدأتش فيه</option>
                {items.filter(row => row.chapter?.id === branch.id).map(row => <option key={row.lesson!.id} value={row.lesson!.id}>{row.lesson!.title}</option>)}
              </select>
            </label>)}
          </div>}
          {backlogMode === "manual" && <div className="grid gap-3 sm:grid-cols-2">
            {branches.map(branch => <fieldset key={branch.id} className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 font-medium">{branch.title}</legend>
              {items.filter(row => row.chapter?.id === branch.id).map(row => {
                const lesson = row.lesson!;
                return <label key={lesson.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={manualBacklog.includes(lesson.id)} onChange={event => {
                    const checked = event.target.checked;
                    setManualBacklog(previous => checked ? [...previous, lesson.id] : previous.filter(id => id !== lesson.id));
                  }} />
                  {lesson.title}
                </label>;
              })}
            </fieldset>)}
          </div>}
          {backlogMode !== "manual" && <details className="rounded border p-2">
            <summary>المتراكم تلقائيًا · {bookBacklog.length} درس</summary>
            <p className="text-sm text-muted-foreground">{backlogMode === "branches" ? "الدروس المكتملة بعد آخر درس حلّيته في كل فرع." : "الدروس المكتملة بعد آخر درس حلّيته في الكتاب."}</p>
            {bookBacklog.length > 0 && <ul className="max-h-48 overflow-y-auto">
              {items.filter(row => bookBacklog.includes(row.lesson!.id)).map(row => <li key={row.lesson!.id}>{row.lesson!.title}</li>)}
            </ul>}
          </details>}
        </fieldset>}
        <div className="flex gap-2"><Button disabled={!subject || change.isPending}>حفظ الكتاب</Button>
          <Button type="button" variant="outline" onClick={() => setBookFormOpen(false)}>إغلاق</Button></div>
      </form></ActionDialog>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {books.filter(item => !subjectFilter || item.subjectId === subjectFilter).map(item => {
          const last = rows.find(row => row.lesson?.id === item.through)?.lesson?.title;
          const backlog = bookBacklogLessons(item, rows).length;
          return <article key={item.id} className="surface flex flex-col gap-3 p-4">
            <BookOpen className="size-5 text-primary" aria-hidden />
            <div><h2 className="font-bold">{item.title}</h2><p className="text-sm text-muted-foreground">{subjects.find(([id]) => id === item.subjectId)?.[1]}</p></div>
            <p className="text-sm">{item.backlogMode === "manual" || item.backlogMode === "branches" ? backlogModes[item.backlogMode] : "آخر درس محلول · " + (last ?? "لسه مبدأتش فيه")}</p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-sm">{backlog} متراكم</span>
              <Button size="sm" variant="outline" onClick={() => openBook(item)}><Pencil /> تعديل</Button></div>
          </article>;
        })}
      </div>
      {!books.some(item => !subjectFilter || item.subjectId === subjectFilter) && <p className="surface p-5 text-sm text-muted-foreground">مفيش كتب هنا لسه.</p>}
    </div>}
    {tab === "الواجبات" && <div className={"grid gap-4"}>
      {attendanceLessons && !homeworkFormOpen && <section className="surface p-4">{homeworkForm}</section>}
      {homeworkFormOpen && <ActionDialog title={editHomework ? "تعديل تفاصيل الواجب" : "سجّل واجب درس"}
        pending={change.isPending} onClose={closeHomework}>{homeworkForm}</ActionDialog>}
      <div className="space-y-4">
      {!attendanceLessons && <section className="surface space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-bold"><ClipboardList className="size-5 text-primary" /> مواعيد التسليم</h2>
        {assignedTasks.data?.filter(task => task.category === "واجب").map(task => {
          const linkLine = task.description?.split("\n").at(-1) ?? "";
          const link = linkLine.startsWith("رابط الواجب: ") ? safeStudyUrl(linkLine.slice("رابط الواجب: ".length)) : null;
          return <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
            <span className="min-w-0 flex-1 wrap-anywhere">{task.status === "completed" ? "✓" : "○"} {task.title}</span>
            {link && <PlatformLink href={link} className="text-primary underline">افتح الواجب</PlatformLink>}
            {task.status === "open" && <Button size="sm" variant="outline" disabled={completeHomework.isPending}
              onClick={() => completeHomework.mutate({ taskId: task.id })}>خلصت</Button>}
            {task.status === "completed" && <Button size="sm" variant="outline" disabled={reopenHomework.isPending} onClick={() => reopenHomework.mutate({ taskId: task.id })}>إلغاء الإكمال</Button>}
          </div>;
        })}
        <a className="text-sm text-primary underline" href="/calendar?view=all">افتح المهام ومواعيد التسليم</a>
      </section>}
      <section className="surface space-y-3 p-5">
      <h2 className="font-bold">الواجبات حسب الدرس</h2>
      {(resources?.homework ?? []).filter(item => !attendanceLessons || attendanceLessons.includes(item.lessonId)).map(item => <article key={item.id} className="rounded border p-2 text-sm">
        <strong>{rows.find(row => row.lesson?.id === item.lessonId)?.lesson?.title} · {item.kind === "online" ? item.platform : books.find(row => row.id === item.bookId)?.title}</strong>
        <p>{item.kind === "online" ? item.prompt : "ص " + item.pages + (item.prompt ? " · " + item.prompt : "")}</p>
        {item.kind === "online" && safeStudyUrl(item.url) && <PlatformLink href={item.url} title={item.platform} className="text-primary underline">افتح الواجب</PlatformLink>}
        <Button size="sm" variant="ghost" onClick={() => { const row = rows.find(row => row.lesson?.id === item.lessonId); setHomeworkSubject(row?.subject.id ?? 0); setHomeworkChapter(row?.chapter?.id ?? 0); setEditHomework(item.id); if (item.kind === "online") { setTeacher(item.sourceId ?? attendanceSourceId ?? 0); setPlatform(item.platform); setWebsite(item.url); setSiteUrl(item.siteUrl ?? ""); } setHomeworkKind(item.kind === "online" ? "online" : "book"); setBookId(item.kind === "online" ? "" : item.bookId); setHomeworkFormOpen(true); }}>تعديل الواجب</Button>
      </article>)}
      </section></div>
    </div>}
    {tab === "كشكول الأخطاء" && <div>
      {examMode === "setup" && <ActionDialog title="اختار مادة الامتحان" onClose={() => setExamMode(undefined)}>
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault();
          if (examQuestions.length) setExamMode("online");
        }}>
          <label className="block space-y-1 text-sm">
            <span>المادة</span>
            <select className={select} value={examSubject} onChange={event => setExamSubject(event.target.value)}>
              <option value="" disabled>اختار المادة</option>
              {subjects.filter(([id]) => examSubjectCounts.has(id)).map(([id, title]) =>
                <option key={id} value={id}>{title} · {examSubjectCounts.get(id)} سؤال</option>)}
              <option value="all">كل المواد · {questions.length} سؤال</option>
            </select>
          </label>
          <Button type="submit" disabled={!examQuestions.length}>ابدأ الامتحان</Button>
        </form>
      </ActionDialog>}
      {(examMode === "online" || examMode === "paper") && <MistakeExam questions={examQuestions}
        booklets={examMode === "paper" ? readBooklets(bookletKey) : undefined} onClose={() => setExamMode(undefined)} />}
      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">الأسئلة المحفوظة</h2>
        {questions.length ? <ul className="max-h-[60dvh] divide-y overflow-y-auto">
          {questions.map(item => {
            const row = rows.find(entry => entry.lesson?.id === item.lessonId);
            const label = [subjects.find(([id]) => id === item.subjectId)?.[1], row?.lesson?.title,
              !item.answer ? "محتاج إجابة" : null].filter(Boolean).join(" · ");
            return <li key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm font-medium">{item.question}</p>
                {label && <p className="mt-1 text-xs text-muted-foreground">{label}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label="تعديل السؤال" onClick={() => setMistakeForm({ question: item })}><Pencil /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label="حذف السؤال" onClick={() => setDeleteQuestion(item)}><Trash2 /></Button>
              </div>
            </li>;
          })}
        </ul> : <p className="text-sm text-muted-foreground">لسه مفيش أسئلة محفوظة.</p>}
      </section>
      {mistakeForm && <MistakeQuestionForm
        existing={mistakeForm.question} subjects={subjects} saving={change.isPending}
        lessons={rows.flatMap(row => row.lesson ? [{ id: row.lesson.id, title: row.lesson.title,
          subjectId: row.subject.id, subject: row.subject.title, chapter: row.chapter?.title }] : [])}
        onSave={item => change.mutate({ type: "mistake", item })}
        onClose={() => setMistakeForm(undefined)} />}
      {deleteQuestion && <AlertDialog open onOpenChange={open => { if (!open && !change.isPending) setDeleteQuestion(undefined); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogTitle>تمسح السؤال ده؟</AlertDialogTitle>
          <AlertDialogDescription className="line-clamp-4 whitespace-pre-wrap">{deleteQuestion.question}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>إلغاء</AlertDialogCancel>
            <Button variant="destructive" disabled={change.isPending}
              onClick={() => change.mutate({ type: "deleteMistake", id: deleteQuestion.id })}>احذف السؤال</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>}
  </div>;
}

export function YearReviewSchedule({ compact = false }: { compact?: boolean }) {
  const plan = trpc.studyPlan.list.useQuery();
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const finish = trpc.planner.finishYearReview.useMutation({
    onSuccess: () => utils.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  const completedReviews = new Set(planner.data?.completedYearReviews);
  const today = plannerToday();
  const groups = new Map<number, NonNullable<typeof plan.data>["rows"]>();
  for (const row of plan.data?.rows ?? []) {
    if (!row.lesson) continue;
    const list = groups.get(row.subject.id) ?? [];
    list.push(row);
    groups.set(row.subject.id, list);
  }
  const previews = Array.from(groups.values()).flatMap(rows => {
    if (rows.some(row => row.progress?.status !== "completed" || !row.progress.completedAt)) return [];
    const completed = Math.max(...rows.map(row => +new Date(row.progress!.completedAt!)));
    const schedule = buildYearReviews(yearReviewDate(completed), rows.length, today);
    return schedule.map(item => ({ ...item, subject: rows[0].subject.title, id: rows[0].subject.id, rows }));
  }).filter(item => item.day >= today || (!compact && !completedReviews.has(item.id + ":" + item.day))).sort((a, b) => a.day.localeCompare(b.day));
  if (compact && !previews.some(item => item.day === today)) return null;
  return <section className="surface space-y-3 p-4">
    <h2 className="flex items-center gap-2 font-bold"><CalendarDays className="size-5 text-primary" /> {compact ? "مراجعة آخر السنة" : "جلسات المراجعة القادمة"}</h2>
    <p className="text-sm text-muted-foreground">بتبدأ بعد آخر درس مكتمل بأسبوع. المواد الأطول ليها يومين في الأسبوع.</p>
    {!previews.length && <p>أول ما تخلّص مادة، مواعيد مراجعتها هتظهر هنا.</p>}
    {previews.filter(item => !compact || item.day === today).map(item => <details key={item.id + item.day} className="rounded border p-3">
      <summary className="cursor-pointer"><span className="font-bold">{item.subject} · {item.title}</span>
        <span className="ms-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "full", timeZone: "UTC" }).format(new Date(item.day))} · {item.to - item.from + 1} درس</span>
      </summary>
      <ul className="mt-2 space-y-1 text-sm">{item.rows.slice(item.from - 1, item.to).map(row =>
        <li key={row.lesson!.id}>{row.chapter?.title} · {row.lesson!.title}</li>)}</ul>
      {completedReviews.has(item.id + ":" + item.day) ? <p className="mt-3 text-sm text-primary">تمت المراجعة</p>
        : item.day <= today && <Button className="mt-3" size="sm" disabled={!planner.data || finish.isPending}
          onClick={() => finish.mutate({ subjectId: item.id, day: item.day })}>خلصت المراجعة</Button>}
    </details>)}
  </section>;
}

export function BookBacklog() {
  const { data } = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const change = trpc.planner.saveStudyResource.useMutation({
    onSuccess: () => Promise.all([utils.planner.list.invalidate(), utils.coins.ledger.invalidate(), utils.dashboard.summary.invalidate()]),
    onError: error => toast.error(errorText(error)),
  });
  const rows = plan.data?.rows ?? [];
  const books = (data?.resources?.books ?? []).map(book => ({ ...book, due: bookBacklogLessons(book, rows) })).filter(book => book.due.length);
  if (!books.length) return null;
  return <section className="surface space-y-2 p-4">
    <h2 className="font-bold">حل الكتب المتراكم</h2>
    {books.map(book => <article key={book.id} className="rounded border p-3">
      <h3 className="font-semibold">{book.title}</h3>
      {book.due.map(id => <div key={id} className="flex flex-wrap items-center justify-between gap-2 py-1">
        <span>{plan.data?.rows.find(row => row.lesson?.id === id)?.lesson?.title ?? "درس غير متاح"}</span>
        <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => change.mutate({
          type: "solveBookLesson", id: book.id, lessonId: id,
        })}>خلصت حلّه</Button>
      </div>)}
    </article>)}
  </section>;
}
