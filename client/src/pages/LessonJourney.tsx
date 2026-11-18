import { Link, useParams } from "wouter";
import { BookOpen, ClipboardList, Focus, GraduationCap } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/study";
import { videoSubject } from "@shared/lessonSources";

export default function LessonJourney() {
  const { id } = useParams<{ id: string }>();
  const plan = trpc.studyPlan.list.useQuery();
  const planner = trpc.planner.list.useQuery();
  const exams = trpc.exams.list.useQuery();

  if (plan.isPending) return <p role="status">بنحمّل الدرس…</p>;
  if (plan.isError) return <Button onClick={() => void plan.refetch()}>جرّب تحميل الدرس تاني</Button>;

  const row = plan.data.rows.find(entry => entry.lesson?.id === Number(id));
  if (!row?.lesson) return <EmptyState title="الدرس غير موجود" description="ارجع لخطة المنهج واختار درس." />;
  const { lesson, subject, chapter, progress } = row;
  const chapterRows = plan.data.rows.filter(entry => chapter && entry.chapter?.id === chapter.id && entry.lesson);
  const completed = chapterRows.filter(entry => entry.progress?.status === "completed").length;
  const resources = planner.data?.resources;
  const homework = resources?.homework.filter(item => item.lessonId === lesson.id) ?? [];
  const relatedExams = exams.data?.filter(item => item.lessons.some(entry => entry.id === lesson.id)) ?? [];
  const focusUrl = "/study-video?" + new URLSearchParams({ subject: videoSubject(subject.title), lesson: lesson.title });
  return <div className="space-y-5">
    <Link href="/study-plan" className="text-sm text-primary underline">خطة المنهج</Link>
    <PageHeader title={lesson.title} description={[subject.title, chapter?.title].filter(Boolean).join(" · ")} />
    <section className="surface space-y-4 p-5">
      {lesson.description && <p className="whitespace-pre-wrap">{lesson.description}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{progress?.status === "completed" ? "الدرس مكتمل" : "تقدّم الدرس"} · {money.format(progress?.progress ?? 0)}٪</span>
        <Button asChild><Link href={focusUrl}><Focus />ابدأ مذاكرة</Link></Button>
      </div>
      <Progress value={progress?.progress ?? 0} aria-label="تقدّم الدرس" />
      {lesson.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lesson.notes}</p>}
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><ClipboardList className="size-4 text-primary" />واجب الدرس</h2>
        {planner.isPending ? <p role="status">بنحمّل الواجبات…</p> : planner.isError ? <Button onClick={() => void planner.refetch()}>أعد تحميل الواجبات</Button> : !homework.length && <p className="text-sm text-muted-foreground">لسه مفيش واجب مرتبط بالدرس.</p>}
        {homework.map(item => <article key={item.id} className="rounded-xl border p-3 text-sm">
          {item.kind === "online" ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">{item.platform}</a> :
            <p className="font-bold">{resources?.books.find(book => book.id === item.bookId)?.title ?? "الكتاب"} · صفحات {item.pages}</p>}
          {item.prompt && <p className="mt-1 whitespace-pre-wrap">{item.prompt}</p>}
        </article>)}
        <Link href="/homework" className="text-sm text-primary underline">افتح الواجبات</Link>
      </section>
      <section className="surface space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><GraduationCap className="size-4 text-primary" />امتحانات الدرس</h2>
        {exams.isPending ? <p role="status">بنحمّل الامتحانات…</p> : exams.isError ? <Button onClick={() => void exams.refetch()}>أعد تحميل الامتحانات</Button> : !relatedExams.length && <p className="text-sm text-muted-foreground">لسه مفيش امتحان مربوط بالدرس.</p>}
        {relatedExams.map(item => <article key={item.exam.id} className="rounded-xl border p-3 text-sm">
          <p className="font-bold">{item.exam.title}</p>
          {item.attempts[0] && <p className="text-muted-foreground">آخر درجة {money.format(item.attempts[0].score)}٪</p>}
        </article>)}
        <Link href="/exams" className="text-sm text-primary underline">افتح الامتحانات</Link>
      </section>
    </div>
    <section className="surface space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold"><BookOpen className="size-4 text-primary" />تقدّم الفصل</h2>
      <p>{money.format(completed)} من {money.format(chapterRows.length)} دروس مكتملة</p>
      <Progress value={chapterRows.length ? completed * 100 / chapterRows.length : 0} aria-label="تقدّم الفصل" />
      <Link href="/mistakes" className="text-sm text-primary underline">افتح كشكول الأخطاء</Link>
    </section>
  </div>;
}
