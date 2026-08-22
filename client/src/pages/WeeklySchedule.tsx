import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/PageHeader";
import { BookOpen, BrainCircuit, CheckCircle2, Circle, Clock3, History, Languages, RefreshCw, Sparkles, Target } from "lucide-react";

type Subject = "العربي" | "التاريخ" | "الإنجليزي" | "البرمجة" | "القصة العربية" | "قصة الإنجليزي" | "استرجاع" | "إصلاح" | "اختبار";

type StudySession = {
  id: string;
  subject: Subject;
  title: string;
  detail: string;
};

type StudyDay = {
  title: string;
  subtitle: string;
  sessions: StudySession[];
};

const storageKey = "seif-study-os-weekly-schedule-v1";

const subjectStyles: Record<Subject, string> = {
  "العربي": "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
  "التاريخ": "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100",
  "الإنجليزي": "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100",
  "البرمجة": "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-100",
  "القصة العربية": "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100",
  "قصة الإنجليزي": "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-100",
  "استرجاع": "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100",
  "إصلاح": "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100",
  "اختبار": "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30 dark:text-fuchsia-100",
};

const days: StudyDay[] = [
  {
    title: "السبت",
    subtitle: "بداية هادئة وذكية",
    sessions: [
      { id: "sat-arabic", subject: "العربي", title: "نص وتحليل", detail: "فكرة الدرس، الشواهد، وسؤال مقالي." },
      { id: "sat-programming", subject: "البرمجة", title: "مفهوم جديد وتطبيق", detail: "افهم، ارسم مخططًا، ثم طبّق." },
      { id: "sat-english", subject: "الإنجليزي", title: "قراءة وكلمات في سياق", detail: "فهم النص قبل حفظ المفردات." },
      { id: "sat-recall", subject: "استرجاع", title: "استرجاع مغلق", detail: "اكتب ما تتذكره بلا كتاب." },
    ],
  },
  {
    title: "الأحد",
    subtitle: "فهم ثم بناء",
    sessions: [
      { id: "sun-history", subject: "التاريخ", title: "درس جديد", detail: "خط زمني + سبب + نتيجة." },
      { id: "sun-grammar", subject: "العربي", title: "قواعد وظيفية", detail: "قاعدة واحدة وتطبيقات جديدة." },
      { id: "sun-programming", subject: "البرمجة", title: "تطبيق وأسئلة", detail: "سؤال اختيار وسؤال مقالي." },
      { id: "sun-arabic-story", subject: "القصة العربية", title: "القصة العربية", detail: "شخصيات، صراع، وقيمة العمل." },
    ],
  },
  {
    title: "الاثنين",
    subtitle: "إنتاج وإصلاح",
    sessions: [
      { id: "mon-english", subject: "الإنجليزي", title: "كتابة قصيرة", detail: "ملخص أو رأي من 60 إلى 100 كلمة." },
      { id: "mon-programming", subject: "البرمجة", title: "درس جديد", detail: "تعريف، خطوات، مثال واقعي." },
      { id: "mon-history", subject: "التاريخ", title: "أسباب ونتائج", detail: "جدول مقارنة أو خريطة أحداث." },
      { id: "mon-repair", subject: "إصلاح", title: "إصلاح أخطاء", detail: "أعد حل أخطاء الأسبوع خلال 48 ساعة." },
    ],
  },
  {
    title: "الثلاثاء",
    subtitle: "جلسات تثبيت",
    sessions: [
      { id: "tue-arabic", subject: "العربي", title: "نص جديد", detail: "حلّل الخطاب وتسلسل الفكرة." },
      { id: "tue-programming", subject: "البرمجة", title: "تطبيق عملي", detail: "طبّق مفهومًا على موقف جديد." },
      { id: "tue-english", subject: "الإنجليزي", title: "قواعد ومفردات", detail: "جمل من إنشائك لا قوائم معزولة." },
      { id: "tue-english-story", subject: "قصة الإنجليزي", title: "قصة الإنجليزي", detail: "حدث، دافع شخصية، ودليل من الفصل." },
    ],
  },
  {
    title: "الأربعاء",
    subtitle: "عمق قبل السرعة",
    sessions: [
      { id: "wed-history", subject: "التاريخ", title: "درس جديد", detail: "فسر، قارن، ثم اختبر نفسك." },
      { id: "wed-arabic", subject: "العربي", title: "تعبير أو قواعد", detail: "إجابة مكتوبة قابلة للتصحيح." },
      { id: "wed-programming", subject: "البرمجة", title: "مراجعة الوحدة", detail: "اربط المفاهيم بخريطة واحدة." },
      { id: "wed-repair", subject: "إصلاح", title: "إصلاح أخطاء", detail: "أخطاء المعرفة والوقت والصياغة." },
    ],
  },
  {
    title: "الخميس",
    subtitle: "يوم القياس الحقيقي",
    sessions: [
      { id: "thu-history", subject: "التاريخ", title: "مراجعة تاريخ", detail: "استرجع درسَين من دون كتاب." },
      { id: "thu-english", subject: "الإنجليزي", title: "تدريب متكامل", detail: "قراءة ثم كتابة قصيرة." },
      { id: "thu-test", subject: "اختبار", title: "اختبار أسبوعي", detail: "اختيار من متعدد + إجابات مقالية." },
      { id: "thu-correct", subject: "اختبار", title: "تصحيح الاختبار", detail: "سجّل لماذا أخطأت قبل الانتقال." },
    ],
  },
];

const sessionIcons: Record<Subject, typeof BookOpen> = {
  "العربي": BookOpen,
  "التاريخ": History,
  "الإنجليزي": Languages,
  "البرمجة": BrainCircuit,
  "القصة العربية": BookOpen,
  "قصة الإنجليزي": Languages,
  "استرجاع": Sparkles,
  "إصلاح": RefreshCw,
  "اختبار": Target,
};

export default function WeeklySchedule() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const totalSessions = useMemo(() => days.flatMap(day => day.sessions), []);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const progress = Math.round((completed.length / totalSessions.length) * 100);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) setCompleted(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(storageKey, JSON.stringify(completed));
  }, [completed, ready]);

  const toggleSession = (sessionId: string) => {
    setCompleted(previous => previous.includes(sessionId) ? previous.filter(id => id !== sessionId) : [...previous, sessionId]);
  };

  const resetWeek = () => {
    setCompleted([]);
    window.localStorage.removeItem(storageKey);
  };

  return (
    <div>
      <PageHeader
        title="جدول الأسبوع"
        description="خطة ثابتة للمواد الأساسية، مع مساحة لاسترجاعك واختبارك الأسبوعي بدل المذاكرة العشوائية."
        action={{ label: "ابدأ أسبوعًا جديدًا", onClick: resetWeek }}
      />

      <section className="mb-6 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
          <div>
            <Badge className="border-0 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/15"><Sparkles className="ml-1 size-3.5" />خطة قاسم 100</Badge>
            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">أربع جلسات واضحة،<br />بدل يوم كامل من التوهان.</h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-300">أنجز كل جلسة على بروتوكول 5–20–10–10–5: استرجاع، فهم، كتابة من الذاكرة، أسئلة، ثم تصحيح. الجلسة لا تُحتسب إلا إذا خرجت منها بإجابة أو حل يمكن مراجعته.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-slate-300">تقدم الأسبوع</p><p className="mt-1 text-3xl font-black" aria-label="الجلسات المنجزة">{completed.length} / {totalSessions.length}</p></div><div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-400 text-xl font-black text-slate-950">{progress}%</div></div>
            <Progress value={progress} className="mt-5 h-2.5 bg-white/10 [&>div]:bg-cyan-400" />
            <p className="mt-3 text-xs leading-5 text-slate-400">هدفك: لا تؤجل جلسات الإصلاح والاختبار إلى نهاية الأسبوع.</p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric icon={Clock3} label="التركيز" value="24 جلسة" copy="50 دقيقة للجلسة + 10 دقائق راحة" />
        <Metric icon={BrainCircuit} label="الأولوية" value="البرمجة × 5" copy="لأنها المادة التخصصية التي اخترتها" />
        <Metric icon={Target} label="القياس" value="الخميس" copy="اختبار أسبوعي وتصحيح الأخطاء" />
      </section>

      <section className="mb-6 grid gap-4 xl:grid-cols-3">
        <div className="surface xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><p className="text-xs font-bold text-primary">جلساتك</p><h2 className="mt-1 text-xl font-black">اضغط على أي جلسة بعد إنجازها</h2></div><Button variant="outline" size="sm" onClick={resetWeek}><RefreshCw className="size-3.5" />إلغاء تحديد الكل</Button></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{days.map(day => <DayCard key={day.title} day={day} completed={completedSet} onToggle={toggleSession} />)}</div></div>
        <aside className="space-y-4">
          <div className="surface p-5"><p className="text-xs font-bold text-primary">بروتوكول الجلسة</p><h2 className="mt-1 text-xl font-black">5–20–10–10–5</h2><div className="mt-4 space-y-3 text-sm"><Step time="5 دقائق" copy="استرجاع درس أمس بلا كتاب." /><Step time="20 دقيقة" copy="فهم جزء صغير ومحدد." /><Step time="10 دقائق" copy="اكتب ما تذكرته من الذاكرة." /><Step time="10 دقائق" copy="حل أسئلة، منها سؤال مقالي." /><Step time="5 دقائق" copy="صحح وسجّل الخطأ." /></div></div>
          <div className="surface p-5"><p className="text-xs font-bold text-primary">أهداف الأسبوع</p><ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li><strong className="text-foreground">العربي:</strong> درسان أو ثلاثة + قاعدة + إجابة.</li><li><strong className="text-foreground">التاريخ:</strong> درسان + خط زمني + أسباب ونتائج.</li><li><strong className="text-foreground">الإنجليزي:</strong> قراءة + كتابة + مفردات في سياق.</li><li><strong className="text-foreground">البرمجة:</strong> درسان أو ثلاثة + تطبيق + إجابة مقالية.</li></ul></div>
        </aside>
      </section>

      <section className="rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-5 text-sm leading-7 text-muted-foreground"><strong className="text-foreground">يوم الجمعة:</strong> راحة حقيقية، أو 20 دقيقة بطاقات فقط. لو ضاع منك يوم، لا تضاعف الحمل غدًا؛ استخدم جلسة إصلاح واحدة وعد للخطة.</section>
    </div>
  );
}

function DayCard({ day, completed, onToggle }: { day: StudyDay; completed: Set<string>; onToggle: (sessionId: string) => void }) {
  return <article className="rounded-2xl border border-border/70 bg-card p-4"><div className="mb-4"><h3 className="font-extrabold">{day.title}</h3><p className="mt-1 text-xs text-muted-foreground">{day.subtitle}</p></div><div className="space-y-2">{day.sessions.map(session => { const done = completed.has(session.id); const Icon = sessionIcons[session.subject]; return <button key={session.id} aria-pressed={done} onClick={() => onToggle(session.id)} className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-right transition hover:-translate-y-0.5 hover:shadow-sm ${subjectStyles[session.subject]} ${done ? "ring-2 ring-emerald-400/60" : ""}`}><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">{done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5 opacity-55" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-xs font-bold opacity-75"><Icon className="size-3.5" />{session.subject}</span><span className={`mt-1 block text-sm font-extrabold ${done ? "line-through opacity-70" : ""}`}>{session.title}</span><span className="mt-1 block text-[11px] leading-4 opacity-75">{session.detail}</span></span></button>; })}</div></article>;
}

function Metric({ icon: Icon, label, value, copy }: { icon: typeof Clock3; label: string; value: string; copy: string }) {
  return <div className="surface flex items-start gap-3 p-4"><span className="metric-icon"><Icon className="size-4" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-extrabold">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p></div></div>;
}

function Step({ time, copy }: { time: string; copy: string }) {
  return <div className="flex gap-3"><span className="min-w-16 rounded-lg bg-primary/10 px-2 py-1 text-center text-xs font-bold text-primary">{time}</span><p className="pt-0.5 text-muted-foreground">{copy}</p></div>;
}
