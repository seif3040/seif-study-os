import { useState } from "react";
import { BookOpen, ClipboardList, CalendarDays, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { bookBacklogLessons, buildYearReviews, yearReviewDate } from "@shared/studyResources";
import { plannerToday } from "@shared/studyPlanner";

const select = "h-10 w-full rounded-md border bg-background px-2";
const fields = (form: HTMLFormElement) => new FormData(form);
const str = (form: FormData, key: string) => String(form.get(key) ?? "");

const sectionDescriptions = {
  "الكتب": "تابع تقدّم الحل والدروس المتراكمة لكل كتاب.",
  "الواجبات": "شوف المطلوب تسليمه ومواعيده، وسجّل صفحات الواجب لكل درس.",
  "كشكول الأخطاء": "راجع الأسئلة اللي غلطت فيها وسجّل أسئلة جديدة.",
  "مراجعة آخر السنة": "شوف مواعيد مراجعة المواد ونطاق الدروس في كل جلسة.",
} as const;

export default function StudyLibrary({ attendanceLessons, section = "الكتب" }: {
  attendanceLessons?: number[];
  section?: keyof typeof sectionDescriptions;
} = {}) {
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const [attendanceTab, setAttendanceTab] = useState<"الكتب" | "الواجبات">("الواجبات");
  const tab = attendanceLessons ? attendanceTab : section;
  const [bookFormOpen, setBookFormOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState(0);
  const [subject, setSubject] = useState(0);
  const [bookId, setBookId] = useState("");
  const [editHomework, setEditHomework] = useState("");
  const assignedTasks = trpc.tasks.list.useQuery(undefined, { enabled: tab === "الواجبات" });
  const [editBook, setEditBook] = useState("");
  const [through, setThrough] = useState<number | null>(null);
  const [kind, setKind] = useState<"essay" | "choice">("essay");
  const [response, setResponse] = useState("");
  const [show, setShow] = useState(false);
  const change = trpc.planner.saveStudyResource.useMutation({
    onSuccess: async (_, entry) => {
      await Promise.all([utils.planner.list.invalidate(), utils.tasks.list.invalidate(), utils.dashboard.summary.invalidate(), utils.calendar.list.invalidate(), utils.coins.ledger.invalidate()]);
      if (entry.type === "book") setBookFormOpen(false);
      if (entry.type === "homework") { setEditHomework(""); setBookId(""); }
      setShow(false); setResponse(""); toast.success("اتحفظ.");
    },
    onError: error => toast.error(errorText(error)),
  });
  if (!plan.data || !planner.data) return <p>{plan.isError || planner.isError ? "تعذّر تحميل مكتبتك." : "جارٍ تحميل المكتبة…"}</p>;
  const resources = planner.data.resources;
  const rows = plan.data.rows;
  const subjects = Array.from(new Map(rows.map(row => [row.subject.id, row.subject.title])));
  const books = resources?.books ?? [];
  const book = books.find(item => item.id === editBook);
  const bookBacklog = bookBacklogLessons({ subjectId: subject, through, solvedLessonIds: book?.subjectId === subject ? book.solvedLessonIds : undefined }, rows);
  const assignment = resources?.homework.find(item => item.id === editHomework);
  const homeworkBook = books.find(item => item.id === bookId);
  const items = rows.filter(row => row.subject.id === (tab === "الواجبات" ? homeworkBook?.subjectId : subject) && row.lesson && (tab !== "الواجبات" || !attendanceLessons || attendanceLessons.includes(row.lesson.id)));
  const questions = resources?.mistakes ?? [];
  const due = questions.find(item => item.due <= plannerToday());
  const lessonOptions = items.map(row => <option value={row.lesson!.id} key={row.lesson!.id}>{row.chapter?.title} · {row.lesson!.title}</option>);
  const openBook = (item?: (typeof books)[number]) => {
    setEditBook(item?.id ?? ""); setSubject(item?.subjectId ?? 0); setThrough(item?.through ?? null); setBookFormOpen(true);
  };
  return <div className="space-y-4">
    {!attendanceLessons && <PageHeader title={section === "الكتب" ? "كتبي" : section} description={sectionDescriptions[section]}
      action={section === "الكتب" ? { label: "كتاب جديد", onClick: () => openBook() } : undefined} />}
    {attendanceLessons && <p className="text-sm">اختار كتاب وصفحات الواجب. لو في كتاب تاني، احفظ الأول وبعدين ضيفه. لو الكتاب مش موجود، ضيفه من «الكتب» هنا.</p>}
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
      {bookFormOpen && <section className="surface space-y-3 p-5">
        <h2 className="font-bold">{book ? "تعديل الكتاب" : "كتاب جديد"}</h2>
      <form key={editBook} className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        change.mutate({ type: "book", item: { id: book?.id ?? crypto.randomUUID(), title: str(form, "title"),
          subjectId: subject, through, backlog: book?.subjectId === subject ? book.backlog : [] } });
      }}>
        <label>اسم الكتاب<Input name="title" required maxLength={180} defaultValue={book?.title} /></label>
        <label>المادة<select required className={select} value={subject || ""} onChange={event => { setSubject(Number(event.target.value)); setThrough(null); }}>
          <option value="">اختار المادة</option>{subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <fieldset key={subject} className="space-y-2">
          <label>حلّيت لحد درس<select name="through" className={select} value={through ?? ""} onChange={event => setThrough(Number(event.target.value) || null)}>
            <option value="">لسه مفيش</option>{lessonOptions}
          </select></label>
          {subject > 0 && <details className="rounded border p-2">
            <summary>المتراكم تلقائيًا · {bookBacklog.length} درس</summary>
            <p className="text-sm text-muted-foreground">الدروس المكتملة بعد آخر درس حلّيته في الكتاب.</p>
            {bookBacklog.length > 0 && <ul className="max-h-48 overflow-y-auto">
              {items.filter(row => bookBacklog.includes(row.lesson!.id)).map(row => <li key={row.lesson!.id}>{row.lesson!.title}</li>)}
            </ul>}
          </details>}
        </fieldset>
        <div className="flex gap-2"><Button disabled={!subject || change.isPending}>حفظ الكتاب</Button>
          <Button type="button" variant="outline" onClick={() => setBookFormOpen(false)}>إغلاق</Button></div>
      </form></section>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {books.filter(item => !subjectFilter || item.subjectId === subjectFilter).map(item => {
          const last = rows.find(row => row.lesson?.id === item.through)?.lesson?.title;
          const backlog = bookBacklogLessons(item, rows).length;
          return <article key={item.id} className="surface flex flex-col gap-3 p-4">
            <BookOpen className="size-5 text-primary" aria-hidden />
            <div><h2 className="font-bold">{item.title}</h2><p className="text-sm text-muted-foreground">{subjects.find(([id]) => id === item.subjectId)?.[1]}</p></div>
            <p className="text-sm">آخر درس محلول · {last ?? "لسه مفيش"}</p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-sm">{backlog} متراكم</span>
              <Button size="sm" variant="outline" onClick={() => openBook(item)}><Pencil /> تعديل</Button></div>
          </article>;
        })}
      </div>
      {!books.some(item => !subjectFilter || item.subjectId === subjectFilter) && <p className="surface p-5 text-sm text-muted-foreground">مفيش كتب هنا لسه.</p>}
    </div>}
    {tab === "الواجبات" && <div className={attendanceLessons ? "grid gap-4" : "grid items-start gap-4 xl:grid-cols-2"}>
      <section className="surface space-y-3 p-5">
      <h2 className="font-bold">{editHomework ? "تعديل تفاصيل الواجب" : "سجّل واجب درس"}</h2>
      {editHomework && <Button size="sm" variant="ghost" onClick={() => { setEditHomework(""); setBookId(""); }}>إلغاء تعديل الواجب</Button>}
      <form key={editHomework} className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        change.mutate({ type: "homework", item: { id: editHomework || crypto.randomUUID(), bookId,
          lessonId: Number(str(form, "lesson")), pages: str(form, "pages"), prompt: str(form, "prompt") } });
      }}>
        <label>الكتاب<select required className={select} value={bookId} onChange={event => setBookId(event.target.value)}>
          <option value="">اختار الكتاب</option>{books.filter(item => !attendanceLessons || rows.some(row => row.subject.id === item.subjectId && row.lesson && attendanceLessons.includes(row.lesson.id))).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>الدرس<select key={bookId} name="lesson" defaultValue={assignment?.lessonId ?? ""} required className={select}><option value="">اختار الدرس</option>{lessonOptions}</select></label>
        <label>الصفحات<Input name="pages" defaultValue={assignment?.pages} placeholder="مثال ٣٥–٣٩" required maxLength={120} /></label>
        <label>المطلوب بالضبط<Textarea name="prompt" defaultValue={assignment?.prompt} maxLength={900} /></label>
        <Button disabled={!bookId || change.isPending}>احفظ واجب الدرس</Button>
      </form>
      </section>
      <div className="space-y-4">
      {!attendanceLessons && <section className="surface space-y-2 p-5">
        <h2 className="flex items-center gap-2 font-bold"><ClipboardList className="size-5 text-primary" /> مواعيد التسليم</h2>
        {assignedTasks.data?.filter(task => task.category === "واجب").map(task => <p key={task.id} className="text-sm">
          {task.status === "completed" ? "✓" : "○"} {task.title}
        </p>)}
        <a className="text-sm text-primary underline" href="/calendar?view=all">افتح المهام ومواعيد التسليم</a>
      </section>}
      <section className="surface space-y-3 p-5">
      <h2 className="font-bold">الواجبات حسب الدرس</h2>
      {(resources?.homework ?? []).filter(item => !attendanceLessons || attendanceLessons.includes(item.lessonId)).map(item => <article key={item.id} className="rounded border p-2 text-sm">
        <strong>{rows.find(row => row.lesson?.id === item.lessonId)?.lesson?.title} · {books.find(row => row.id === item.bookId)?.title}</strong>
        <p>ص {item.pages} · {item.prompt}</p>
        <Button size="sm" variant="ghost" onClick={() => { setEditHomework(item.id); setBookId(item.bookId); }}>تعديل الواجب</Button>
      </article>)}
      </section></div>
    </div>}
    {tab === "كشكول الأخطاء" && <div className="grid items-start gap-4 xl:grid-cols-2">
      <section className="surface space-y-3 p-5">
      <h2 className="font-bold">المراجعة</h2>
      {due ? <article className="space-y-2 rounded-lg border p-3">
        <h2 className="font-bold">سؤال للمراجعة</h2><p className="whitespace-pre-wrap">{due.question}</p>
        {due.kind === "choice" ? <select className={select} value={response} onChange={e => setResponse(e.target.value)} disabled={show}>
          <option value="">اختار إجابتك</option>{due.options.map(option => <option key={option}>{option}</option>)}
        </select> : <Textarea aria-label="إجابتك" value={response} onChange={event => setResponse(event.target.value)} disabled={show} />}
        {show ? <><p className="whitespace-pre-wrap">الإجابة الصحيحة · {due.answer}</p>
          {(due.kind === "essay" ? [true, false] : [response === due.answer]).map(correct => <Button key={String(correct)} size="sm" variant="outline"
            disabled={change.isPending} onClick={() => change.mutate({ type: "check", id: due.id, correct })}>{correct ? "صح، سجّل المراجعة" : "غلط، اسألني تاني"}</Button>)}
        </> : <Button disabled={!response.trim()} onClick={() => setShow(true)}>اعرض الإجابة</Button>}
      </article> : <p>مفيش أسئلة مستحقة دلوقتي.</p>}
      </section>
      <form className="surface space-y-3 p-5" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        change.mutate({ type: "mistake", item: { id: crypto.randomUUID(), subjectId: Number(str(form, "subject")),
          question: str(form, "question"), kind, options: kind === "choice" ? str(form, "options").split("\n").map(x => x.trim()).filter(Boolean) : [],
          answer: str(form, "answer") } });
      }}>
        <h2 className="font-bold">ضيف سؤال غلطت فيه</h2>
        <select name="subject" required aria-label="المادة" className={select}><option value="">اختار المادة</option>{subjects.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>
        <select value={kind} aria-label="نوع السؤال" className={select} onChange={e => setKind(e.target.value === "choice" ? "choice" : "essay")}><option value="essay">مقالي</option><option value="choice">اختياري</option></select>
        <Textarea name="question" required maxLength={1500} placeholder="نص السؤال" />
        {kind === "choice" && <Textarea name="options" required placeholder="كل اختيار في سطر" />}
        <Textarea name="answer" required maxLength={1200} placeholder="الإجابة النموذجية أو الاختيار الصحيح بالنص" />
        <Button disabled={change.isPending}>احفظ السؤال</Button>
      </form>
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
