import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { buildYearReviews } from "@shared/studyResources";
import { plannerToday } from "@shared/studyPlanner";

const select = "h-10 w-full rounded-md border bg-background px-2";
const fields = (form: HTMLFormElement) => new FormData(form);
const str = (form: FormData, key: string) => String(form.get(key) ?? "");

export default function StudyLibrary({ attendanceLessons }: { attendanceLessons?: number[] } = {}) {
  const planner = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState(attendanceLessons ? "الواجبات" : "الكتب");
  const [subject, setSubject] = useState(0);
  const [bookId, setBookId] = useState("");
  const [editHomework, setEditHomework] = useState("");
  const assignedTasks = trpc.tasks.list.useQuery(undefined, { enabled: tab === "الواجبات" });
  const [editBook, setEditBook] = useState("");
  const [kind, setKind] = useState<"essay" | "choice">("essay");
  const [response, setResponse] = useState("");
  const [show, setShow] = useState(false);
  const change = trpc.planner.saveStudyResource.useMutation({
    onSuccess: async () => { await Promise.all([utils.planner.list.invalidate(), utils.tasks.list.invalidate(), utils.dashboard.summary.invalidate(), utils.calendar.list.invalidate()]); setShow(false); setResponse(""); toast.success("اتحفظ."); },
    onError: error => toast.error(errorText(error)),
  });
  if (!plan.data || !planner.data) return <p>{plan.isError || planner.isError ? "تعذّر تحميل مكتبتك." : "جارٍ تحميل المكتبة…"}</p>;
  const resources = planner.data.resources;
  const rows = plan.data.rows;
  const subjects = Array.from(new Map(rows.map(row => [row.subject.id, row.subject.title])));
  const books = resources?.books ?? [];
  const book = books.find(item => item.id === editBook);
  const assignment = resources?.homework.find(item => item.id === editHomework);
  const homeworkBook = books.find(item => item.id === bookId);
  const items = rows.filter(row => row.subject.id === (tab === "الواجبات" ? homeworkBook?.subjectId : subject) && row.lesson && (tab !== "الواجبات" || !attendanceLessons || attendanceLessons.includes(row.lesson.id)));
  const questions = resources?.mistakes ?? [];
  const due = questions.find(item => item.due <= plannerToday());
  const lessonOptions = items.map(row => <option value={row.lesson!.id} key={row.lesson!.id}>{row.chapter?.title} · {row.lesson!.title}</option>);
  return <div className="space-y-4">
    {!attendanceLessons && <PageHeader title="كتبي وواجباتي" description="تابع حل الكتب، سجل الواجبات، وراجع الأسئلة اللي غلطت فيها." />}
    {attendanceLessons && <p className="text-sm">اختار كتاب وصفحات الواجب. لو في كتاب تاني، احفظ الأول وبعدين ضيفه. لو الكتاب مش موجود، ضيفه من «الكتب» هنا.</p>}
    <div className="flex flex-wrap gap-2">
      {(attendanceLessons ? ["الكتب", "الواجبات"] : ["الكتب", "الواجبات", "كشكول الأخطاء", "مراجعة آخر السنة"]).map(item => <Button key={item} variant={item === tab ? "default" : "outline"} aria-pressed={item === tab} onClick={() => setTab(item)}>{item}</Button>)}
    </div>
    {tab === "مراجعة آخر السنة" && <YearReviewSchedule />}
    {tab === "الكتب" && <div className="surface space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { setEditBook(""); setSubject(0); }}>كتاب جديد</Button>
        {books.map(item => <Button key={item.id} size="sm" variant={editBook === item.id ? "default" : "outline"} onClick={() => {
          setEditBook(item.id); setSubject(item.subjectId);
        }}>{item.title} · {item.backlog.length} متراكم</Button>)}
      </div>
      <form key={editBook} className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const form = fields(event.currentTarget);
        change.mutate({ type: "book", item: { id: book?.id ?? crypto.randomUUID(), title: str(form, "title"),
          subjectId: subject, through: Number(str(form, "through")) || null, backlog: form.getAll("backlog").map(Number) } });
      }}>
        <label>اسم الكتاب<Input name="title" required maxLength={180} defaultValue={book?.title} /></label>
        <label>المادة<select required className={select} value={subject || ""} onChange={event => setSubject(Number(event.target.value))}>
          <option value="">اختار المادة</option>{subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <fieldset key={subject} className="space-y-2">
          <label>حلّيت لحد درس<select name="through" className={select} defaultValue={book?.through ?? ""}>
            <option value="">لسه مفيش</option>{lessonOptions}
          </select></label>
          <details className="rounded border p-2"><summary>علّم الدروس المتراكمة في الكتاب</summary>
            <div className="max-h-48 overflow-y-auto">{items.map(row => <label key={row.lesson!.id} className="block p-1">
              <input type="checkbox" name="backlog" value={row.lesson!.id} defaultChecked={book?.backlog.includes(row.lesson!.id)} /> {row.lesson!.title}
            </label>)}</div>
          </details>
        </fieldset>
        <Button disabled={!subject || change.isPending}>حفظ الكتاب</Button>
      </form>
    </div>}
    {tab === "الواجبات" && <div className="surface space-y-3 p-4">
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
      {!attendanceLessons && <div className="space-y-1">
        <h2 className="font-bold">الواجبات المسجّلة في التقويم</h2>
        {assignedTasks.data?.filter(task => task.category === "واجب").map(task => <p key={task.id} className="text-sm">
          {task.status === "completed" ? "✓" : "○"} {task.title}
        </p>)}
        <a className="text-sm text-primary underline" href="/calendar?view=all">افتح المهام ومواعيد التسليم</a>
      </div>}
      {(resources?.homework ?? []).filter(item => !attendanceLessons || attendanceLessons.includes(item.lessonId)).map(item => <article key={item.id} className="rounded border p-2 text-sm">
        <strong>{rows.find(row => row.lesson?.id === item.lessonId)?.lesson?.title} · {books.find(row => row.id === item.bookId)?.title}</strong>
        <p>ص {item.pages} · {item.prompt}</p>
        <Button size="sm" variant="ghost" onClick={() => { setEditHomework(item.id); setBookId(item.bookId); }}>تعديل الواجب</Button>
      </article>)}
    </div>}
    {tab === "كشكول الأخطاء" && <div className="surface space-y-3 p-4">
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
      <form className="space-y-3" onSubmit={event => {
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
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
    const schedule = buildYearReviews(date.format(completed), rows.length, today);
    return schedule.map(item => ({ ...item, subject: rows[0].subject.title, id: rows[0].subject.id, rows }));
  }).filter(item => item.day >= today).sort((a, b) => a.day.localeCompare(b.day));
  if (compact && !previews.some(item => item.day === today)) return null;
  return <section className="surface space-y-3 p-4">
    <h2 className="font-bold">مراجعة آخر السنة</h2>
    <p className="text-sm text-muted-foreground">بتبدأ بعد آخر درس مكتمل بأسبوع. المواد الأطول ليها يومين في الأسبوع.</p>
    {!previews.length && <p>أول ما تخلّص مادة، مواعيد مراجعتها هتظهر هنا.</p>}
    {previews.filter(item => !compact || item.day === today).map(item => <details key={item.id + item.day} className="rounded border p-3">
      <summary className="cursor-pointer">{item.day} · {item.subject} · {item.title}</summary>
      <ul className="mt-2 space-y-1 text-sm">{item.rows.slice(item.from - 1, item.to).map(row =>
        <li key={row.lesson!.id}>{row.chapter?.title} · {row.lesson!.title}</li>)}</ul>
    </details>)}
  </section>;
}

export function BookBacklog() {
  const { data } = trpc.planner.list.useQuery();
  const plan = trpc.studyPlan.list.useQuery();
  const utils = trpc.useUtils();
  const change = trpc.planner.saveStudyResource.useMutation({
    onSuccess: () => utils.planner.list.invalidate(),
    onError: error => toast.error(errorText(error)),
  });
  const books = data?.resources?.books.filter(book => book.backlog.length) ?? [];
  if (!books.length) return null;
  return <section className="surface space-y-2 p-4">
    <h2 className="font-bold">حل الكتب المتراكم</h2>
    {books.map(book => <article key={book.id} className="rounded border p-3">
      <h3 className="font-semibold">{book.title}</h3>
      {book.backlog.map(id => <div key={id} className="flex flex-wrap items-center justify-between gap-2 py-1">
        <span>{plan.data?.rows.find(row => row.lesson?.id === id)?.lesson?.title ?? "درس غير متاح"}</span>
        <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => change.mutate({
          type: "book", item: { ...book, backlog: book.backlog.filter(value => value !== id) },
        })}>خلصت حلّه</Button>
      </div>)}
    </article>)}
  </section>;
}
