import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ReplanStudy } from "@/components/ReplanStudy";
import { plannerToday } from "@shared/studyPlanner";
import { toast } from "sonner";

export default function ExamPrep() {
  const { id } = useParams<{ id: string }>();
  const exams = trpc.exams.list.useQuery();
  const planner = trpc.planner.list.useQuery();
  if (exams.isPending || planner.isPending) return <p role="status">بنحمّل مراجعة الامتحان…</p>;
  if (exams.isError || planner.isError) return <Button onClick={() => void Promise.all([exams.refetch(), planner.refetch()])}>جرّب التحميل تاني</Button>;
  const item = exams.data.find(entry => entry.exam.id === Number(id));
  if (!item) return <EmptyState title="الامتحان غير موجود" description="ارجع للامتحانات واختار اختبار." />;
  const mistakes = planner.data.resources?.mistakes ?? [];
  const subjects = new Set(item.lessons.map(lesson => lesson.subjectTitle));
  if (item.subject) subjects.add(item.subject);
  return <div className="space-y-5">
    <Link href="/exams" className="text-sm text-primary underline">الامتحانات</Link>
    <PageHeader title="امتحاني قرب" description={item.exam.title} />
    <section className="surface space-y-4 p-5">
      <h2 className="font-bold">خريطة الجاهزية</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["choice", "essay"] as const).map(kind => {
          const checked = mistakes.filter(question => question.kind === kind && question.lastCorrect !== undefined &&
            item.lessons.some(lesson => lesson.id === question.lessonId));
          const correct = checked.filter(question => question.lastCorrect).length;
          return <div key={kind} className="rounded-xl border p-3 text-sm">
            <strong>{kind === "choice" ? "الاختياري" : "المقالي"}</strong>
            <p className="mt-1 text-muted-foreground">{checked.length ? correct + " من " + checked.length + " صح في آخر محاولة لكل سؤال" : "لسه مفيش إجابات مسجّلة على دروس الامتحان"}</p>
          </div>;
        })}
      </div>
      {item.lessons.length === 0 && <p className="text-sm text-muted-foreground">اربط دروس بالامتحان عشان يظهر تقدّمك هنا.</p>}
      {Array.from(new Set(item.lessons.map(lesson => lesson.chapterTitle))).map(chapter => {
        const lessons = item.lessons.filter(lesson => lesson.chapterTitle === chapter);
        const ordered = [...lessons].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || Number(Boolean(a.lastReviewedAt)) - Number(Boolean(b.lastReviewedAt)));
        return <article key={chapter} className="space-y-2 rounded-xl border p-3">
          <h3 className="font-semibold">{chapter}</h3>
          {ordered.map(lesson => {
            const ready = lesson.status === "completed" && Boolean(lesson.lastReviewedAt);
            const needsPractice = mistakes.some(question => question.lessonId === lesson.id && question.lastCorrect === false);
            const completed = lesson.status === "completed";
            return <div key={lesson.id} className="flex flex-wrap justify-between gap-2 text-sm">
              <Link href={"/study-plan/lesson/" + lesson.id} className="hover:underline">{lesson.title}</Link>
              <span className={ready && !needsPractice ? "rounded-md bg-emerald-500/15 px-2" : completed ? "rounded-md bg-amber-500/20 px-2" : "rounded-md bg-red-500/20 px-2"}>
                {needsPractice ? "محتاج تدريب" : ready ? "مكتمل ومراجع" : completed ? "محتاج مراجعة" : "لسه ناقص"}
              </span>
            </div>;
          })}
        </article>;
      })}
      <ReplanStudy day={plannerToday()} />
    </section>
    <TimedMock key={"mock-" + id} examId={item.exam.id} lessons={item.lessons} />
    <Practice key={id} examId={item.exam.id} subjectNames={subjects} lessonIds={item.lessons.map(lesson => lesson.id)} />
  </div>;
}

function Practice({ examId, subjectNames, lessonIds }: { examId: number; subjectNames: Set<string>; lessonIds: number[] }) {
  const plan = trpc.studyPlan.list.useQuery();
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const [seen, setSeen] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const subjectIds = new Set(plan.data?.rows.filter(row => subjectNames.has(row.subject.title)).map(row => row.subject.id));
  const questions = [...(planner.data?.resources?.mistakes ?? [])]
    .filter(question => question.answer && (question.lessonId ? lessonIds.includes(question.lessonId) : subjectIds.has(question.subjectId)))
    .sort((a, b) => a.due.localeCompare(b.due));
  const current = questions.find(question => !seen.includes(question.id));
  const save = trpc.planner.saveStudyResource.useMutation({
    onSuccess: async (_, variables) => {
      if (variables.type !== "check") return;
      setSeen(previous => [...previous, variables.id]);
      setRevealed(false);
      setAnswer("");
      await utils.planner.list.invalidate();
    },
    onError: () => toast.error("تعذّر حفظ نتيجة التدريب. جرّب تاني."),
  });
  return <section className="surface space-y-3 p-5">
    <h2 className="font-bold">تدريب من كشكول الأخطاء</h2>
    {plan.isPending ? <p role="status">بنحمّل الأسئلة…</p> : plan.isError ? <Button onClick={() => void plan.refetch()}>أعد تحميل الأسئلة</Button> : current ? <>
      <p className="whitespace-pre-wrap">{current.question}</p>
      {current.kind === "choice" ? <div className="flex flex-wrap gap-2">
        {current.options.map(option => <Button key={option} size="sm" aria-pressed={answer === option}
          variant={answer === option ? "default" : "outline"} disabled={revealed} onClick={() => setAnswer(option)}>{option}</Button>)}
      </div> : <textarea value={answer} disabled={revealed} onChange={event => setAnswer(event.target.value)} className="w-full rounded-lg border bg-background p-2" aria-label="إجابتك" />}
      {!revealed ? <Button disabled={!answer.trim()} onClick={() => setRevealed(true)}>شوف الإجابة</Button> : <>
        <p className="whitespace-pre-wrap text-sm">الإجابة الصحيحة · {current.answer}</p>
        {current.kind === "choice" ? <Button disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, examId, correct: answer === current.answer })}>احفظ وكمل</Button> :
          <div className="flex flex-wrap gap-2">
            <Button disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, examId, correct: true })}>إجابتي صح</Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, examId, correct: false })}>محتاج أتدرّب عليها</Button>
          </div>}
      </>}
    </> : <p className="text-sm text-muted-foreground">{seen.length ? "خلصت أسئلة التدريب المتاحة." : "لسه مفيش أسئلة محفوظة لمواد الامتحان."}</p>}
    <Link href="/mistakes" className="block text-sm text-primary underline">كشكول الأخطاء</Link>
    <Link href={"/exams#exam-" + examId} className="block text-sm text-primary underline">سجّل نتيجتك من صفحة الامتحان</Link>
  </section>;
}

function TimedMock({ examId, lessons }: { examId: number; lessons: { id: number; chapterTitle: string }[] }) {
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.planner.saveStudyResource.useMutation();
  const chapters = Array.from(new Set(lessons.map(lesson => lesson.chapterTitle)));
  const [chapter, setChapter] = useState("");
  const [minutes, setMinutes] = useState(15);
  const bank = (planner.data?.resources?.mistakes ?? []).filter(question => question.answer).filter(question =>
    lessons.some(lesson => lesson.id === question.lessonId && (!chapter || lesson.chapterTitle === chapter)));
  const [attempt, setAttempt] = useState<{ questions: typeof bank; deadline: number }>();
  const [now, setNow] = useState(Date.now);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [essayGrades, setEssayGrades] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!attempt || submitted) return;
    const clock = () => {
      const time = Date.now();
      setNow(time);
      if (time >= attempt.deadline) setSubmitted(true);
    };
    clock();
    const id = window.setInterval(clock, 250);
    return () => window.clearInterval(id);
  }, [attempt, submitted]);

  function start() {
    const time = Date.now();
    setNow(time);
    setAttempt({ questions: bank.slice(0, 20), deadline: time + minutes * 60_000 });
    setAnswers({});
    setEssayGrades({});
    setSaved(false);
    setSubmitted(false);
  }

  function grade(question: typeof bank[number]) {
    if (!answers[question.id]?.trim()) return false;
    return question.kind === "choice" ? answers[question.id] === question.answer : essayGrades[question.id];
  }

  async function saveResults() {
    if (!attempt || busy || saved) return;
    setBusy(true);
    try {
      for (const question of attempt.questions) {
        await save.mutateAsync({ type: "check", examId, id: question.id, correct: grade(question) === true });
      }
      await utils.planner.list.invalidate();
      setSaved(true);
    } catch {
      toast.error("تعذّر حفظ بعض النتائج. جرّب الحفظ تاني.");
    } finally {
      setBusy(false);
    }
  }

  const remaining = Math.max(0, Math.ceil(((attempt?.deadline ?? now) - now) / 1000));
  const ready = attempt?.questions.every(question => grade(question) !== undefined);
  return <section className="surface space-y-4 p-5">
    <h2 className="font-bold">امتحان تجريبي بوقت</h2>
    {!attempt ? <>
      <div className="flex flex-wrap gap-3 text-sm">
        <label>الوحدة <select className="rounded-md border bg-background p-2" value={chapter} onChange={event => setChapter(event.target.value)}>
          <option value="">كل وحدات الامتحان</option>
          {chapters.map(title => <option key={title}>{title}</option>)}
        </select></label>
        <label>المدة <select className="rounded-md border bg-background p-2" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
          {[5, 10, 15, 25, 45, 60].map(value => <option key={value} value={value}>{value} دقيقة</option>)}
        </select></label>
      </div>
      <p className="text-sm text-muted-foreground">{bank.length ? Math.min(bank.length, 20) + " سؤال من كشكول الأخطاء" : "اربط أسئلة بدروس الوحدة من كشكول الأخطاء عشان تبدأ."}</p>
      <Button disabled={!bank.length} onClick={start}>ابدأ الامتحان التجريبي</Button>
    </> : <>
      {!submitted && <p className="sticky top-16 z-10 rounded-lg bg-background p-2 font-bold">الوقت المتبقي <span dir="ltr">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span></p>}
      {attempt.questions.map((question, index) => <article key={question.id} className="space-y-2 rounded-xl border p-3">
        <p className="whitespace-pre-wrap font-semibold">{index + 1}. {question.question}</p>
        {submitted ? <>
          <p className="whitespace-pre-wrap text-sm">إجابتك · {answers[question.id] || "سؤال من غير إجابة"}</p>
          <p className="whitespace-pre-wrap text-sm">الإجابة النموذجية · {question.answer}</p>
          {question.kind === "essay" && answers[question.id]?.trim() && <div className="flex gap-2">
            <Button size="sm" disabled={busy || saved} aria-pressed={essayGrades[question.id] === true} variant={essayGrades[question.id] === true ? "default" : "outline"} onClick={() => setEssayGrades(previous => ({ ...previous, [question.id]: true }))}>إجابتي صح</Button>
            <Button size="sm" disabled={busy || saved} aria-pressed={essayGrades[question.id] === false} variant={essayGrades[question.id] === false ? "default" : "outline"} onClick={() => setEssayGrades(previous => ({ ...previous, [question.id]: false }))}>محتاج أراجع</Button>
          </div>}
        </> : question.kind === "choice" ? <div className="flex flex-wrap gap-2">
          {question.options.map(option => <Button key={option} size="sm" aria-pressed={answers[question.id] === option}
            variant={answers[question.id] === option ? "default" : "outline"} onClick={() => setAnswers(previous => ({ ...previous, [question.id]: option }))}>{option}</Button>)}
        </div> : <textarea aria-label={"إجابة سؤال " + (index + 1)} className="w-full rounded-md border bg-background p-2"
          value={answers[question.id] ?? ""} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} />}
      </article>)}
      {submitted ? <>
        {ready ? <>
          <p className="font-bold">النتيجة · {attempt.questions.filter(question => grade(question)).length}/{attempt.questions.length}</p>
          {chapters.map(title => {
            const questions = attempt.questions.filter(question => lessons.some(lesson => lesson.id === question.lessonId && lesson.chapterTitle === title));
            return questions.length > 0 && <p key={title} className="text-sm">{title} · {questions.filter(question => grade(question)).length}/{questions.length}</p>;
          })}
          <Button disabled={busy || saved} onClick={() => void saveResults()}>{saved ? "نتائج التدريب اتحفظت" : "احفظ النتيجة وحدّث المراجعات"}</Button>
        </> : <p className="text-sm">صحّح إجابات المقالي عشان تظهر النتيجة.</p>}
        <Button className="ms-2" variant="outline" disabled={busy} onClick={() => setAttempt(undefined)}>اختبار جديد</Button>
      </> : <Button onClick={() => setSubmitted(true)}>سلّم الامتحان</Button>}
    </>}
  </section>;
}
