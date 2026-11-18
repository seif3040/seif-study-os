import { useState } from "react";
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
  const subjects = new Set(item.lessons.map(lesson => lesson.subjectTitle));
  if (item.subject) subjects.add(item.subject);
  return <div className="space-y-5">
    <Link href="/exams" className="text-sm text-primary underline">الامتحانات</Link>
    <PageHeader title="امتحاني قرب" description={item.exam.title} />
    <section className="surface space-y-4 p-5">
      <h2 className="font-bold">خريطة الجاهزية</h2>
      {item.lessons.length === 0 && <p className="text-sm text-muted-foreground">اربط دروس بالامتحان عشان يظهر تقدّمك هنا.</p>}
      {Array.from(new Set(item.lessons.map(lesson => lesson.chapterTitle))).map(chapter => {
        const lessons = item.lessons.filter(lesson => lesson.chapterTitle === chapter);
        const ordered = [...lessons].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || Number(Boolean(a.lastReviewedAt)) - Number(Boolean(b.lastReviewedAt)));
        return <article key={chapter} className="space-y-2 rounded-xl border p-3">
          <h3 className="font-semibold">{chapter}</h3>
          {ordered.map(lesson => {
            const ready = lesson.status === "completed" && Boolean(lesson.lastReviewedAt);
            const completed = lesson.status === "completed";
            return <div key={lesson.id} className="flex flex-wrap justify-between gap-2 text-sm">
              <Link href={"/study-plan/lesson/" + lesson.id} className="hover:underline">{lesson.title}</Link>
              <span className={ready ? "rounded-md bg-emerald-500/15 px-2" : completed ? "rounded-md bg-amber-500/20 px-2" : "rounded-md bg-red-500/20 px-2"}>
                {ready ? "مكتمل ومراجع" : completed ? "محتاج مراجعة" : "لسه ناقص"}
              </span>
            </div>;
          })}
        </article>;
      })}
      <ReplanStudy day={plannerToday()} />
    </section>
    <Practice key={id} examId={item.exam.id} subjectNames={subjects} />
  </div>;
}

function Practice({ examId, subjectNames }: { examId: number; subjectNames: Set<string> }) {
  const plan = trpc.studyPlan.list.useQuery();
  const planner = trpc.planner.list.useQuery();
  const utils = trpc.useUtils();
  const [seen, setSeen] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const subjectIds = new Set(plan.data?.rows.filter(row => subjectNames.has(row.subject.title)).map(row => row.subject.id));
  const questions = [...(planner.data?.resources?.mistakes ?? [])]
    .filter(question => subjectIds.has(question.subjectId))
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
        {current.kind === "choice" ? <Button disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, correct: answer === current.answer })}>احفظ وكمل</Button> :
          <div className="flex flex-wrap gap-2">
            <Button disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, correct: true })}>إجابتي صح</Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ type: "check", id: current.id, correct: false })}>محتاج أتدرّب عليها</Button>
          </div>}
      </>}
    </> : <p className="text-sm text-muted-foreground">{seen.length ? "خلصت أسئلة التدريب المتاحة." : "لسه مفيش أسئلة محفوظة لمواد الامتحان."}</p>}
    <Link href="/mistakes" className="block text-sm text-primary underline">كشكول الأخطاء</Link>
    <Link href={"/exams#exam-" + examId} className="block text-sm text-primary underline">سجّل نتيجتك من صفحة الامتحان</Link>
  </section>;
}
