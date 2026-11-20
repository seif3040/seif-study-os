import { trpc } from "@/lib/trpc";
import { answerSheetLayout, readBookletMarks } from "@/lib/readBookletMarks";
import { useState } from "react";
import { Camera, CheckCircle2, FileImage, XCircle } from "lucide-react";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { letters, type Booklet, type ExamQuestion } from "@/lib/mistakeBooklet";

const focusResult = (element: HTMLDivElement | null) => { element?.focus(); };

type ExamProps = {
  questions: ExamQuestion[];
  booklets?: Booklet[];
  onClose: () => void;
};

export default function MistakeExam({ questions, booklets, onClose }: ExamProps) {
  const grading = trpc.exams.gradeMistakes.useMutation();
  const paper = booklets !== undefined;
  const [booklet, setBooklet] = useState(booklets?.[0]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [aiGrades, setAiGrades] = useState<{ id: string; score: number | null; explanation: string }[]>([]);
  const [essayMarks, setEssayMarks] = useState<Record<string, boolean>>({});
  const [onlineQuestions] = useState(questions);
  const items = paper ? booklet?.questions ?? [] : onlineQuestions;
  const graded = items.filter(item => item.kind === "choice" && item.options.includes(item.answer));
  const markedGrades = aiGrades.filter(grade => grade.score !== null);
  const average = markedGrades.length ? Math.round(markedGrades.reduce((total, grade) => total + grade.score!, 0) / markedGrades.length) : null;
  const answered = items.filter(item => answers[item.id]?.trim()).length;

  const choices = items.filter(item => item.kind === "choice");
  const pageCount = Math.ceil(choices.length / answerSheetLayout.rows);
  async function loadImage(file?: File) {
    if (!file) return;
    if (!/^image\/(?!svg\+xml)/i.test(file.type) || file.size > 15 * 1024 * 1024) {
      setFeedback("اختار صورة حجمها أقل من 15 ميجا.");
      return;
    }
    setReading(true);
    setFeedback("بنقرأ ورقة الإجابة…");
    const source = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1300 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const rows = choices.slice(page * answerSheetLayout.rows, (page + 1) * answerSheetLayout.rows);
      const detected = readBookletMarks(canvas, rows);
      const count = Object.keys(detected).length;
      if (count) setAnswers(previous => ({ ...previous, ...detected }));
      setFeedback(count ? "اتقرت " + count + " إجابة. راجع الاختيارات اللي ظهرت قبل التصحيح."
        : "مفيش علامات واضحة اتقرت. صوّر الورقة بشكل مستقيم وخلّي الأربع مربعات السودا باينة، أو اختار الإجابات بنفسك.");
    } catch {
      setFeedback("تعذّرت قراءة الصورة. جرّب صورة أوضح أو اختار الإجابات بنفسك.");
    } finally {
      URL.revokeObjectURL(source);
      setReading(false);
    }
  }

  return <ActionDialog title={paper ? "صحّح ملزمة ورقية" : "امتحان كشكول الأخطاء"} pending={reading || grading.isPending} onClose={onClose}>
    {paper && !booklet && <p className="text-sm text-muted-foreground">صدّر ملزمة الأول من نفس المتصفح عشان التصحيح يستخدم نفس ترتيب الأسئلة.</p>}
    {paper && booklet && <div className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>كود الملزمة المطبوع على الورقة</span>
        <select className="h-10 w-full rounded-md border bg-background px-2" dir="ltr" aria-label="كود الملزمة"
          value={booklet.code} disabled={reading} onChange={event => {
            setBooklet(booklets.find(item => item.code === event.target.value));
            setAnswers({});
            setPage(0);
            setSubmitted(false);
            setEssayMarks({});
            setFeedback("");
          }}>
          {booklets.map(item => <option key={item.code} value={item.code}>{item.code} · {item.date}</option>)}
        </select>
      </label>
      {!submitted && !!pageCount && <div className="flex flex-wrap items-end gap-2">
        {pageCount > 1 && <label className="space-y-1 text-sm">
          <span>رقم ورقة الإجابة</span>
          <select className="block h-10 rounded-md border bg-background px-2" value={page} disabled={reading}
            onChange={event => setPage(Number(event.target.value))}>
            {Array.from({ length: pageCount }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
          </select>
        </label>}
        <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
          <FileImage className="size-4" /> ارفع صورة الإجابات
          <input className="sr-only" type="file" accept="image/*" disabled={reading}
            onChange={event => { void loadImage(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
          <Camera className="size-4" /> صوّر ورقة الإجابة
          <input className="sr-only" type="file" accept="image/*" capture="environment" disabled={reading}
            onChange={event => { void loadImage(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>}
      {feedback && !submitted && <p className="text-sm text-muted-foreground" role="status">{feedback}</p>}
    </div>}
    {!!items.length && <form className="space-y-4" onSubmit={async event => {
      event.preventDefault();
      try {
        const results = [];
        for (let offset = 0; offset < items.length; offset += 15) {
          const batch = await grading.mutateAsync({ answers: items.slice(offset, offset + 15).map(item => ({ id: item.id, answer: answers[item.id] ?? "" })) });
          results.push(...batch);
        }
        setAiGrades(results);
        setSubmitted(true);
      } catch { /* Mutation error is shown with a retry action. */ }
    }}>
      {submitted && <div className="rounded-lg border bg-muted/40 p-4" role="status" tabIndex={-1}
        ref={focusResult}>
        <p className="text-xs text-muted-foreground">التصحيح تقديري بناءً على الإجابة المحفوظة. راجع التفسير مع إجابتك.</p>
        <p className="font-bold">{average === null ? "الامتحان محتاج مراجعة" : "نتيجة التصحيح بالذكاء الاصطناعي · " + average + "%"}</p>
        {items.some(item => item.kind === "essay") && <p className="text-sm text-muted-foreground">
          المقالي · راجعت {Object.keys(essayMarks).length} من {items.filter(item => item.kind === "essay").length}
          {" · "}صح {Object.values(essayMarks).filter(Boolean).length}
        </p>}
      </div>}
      {!submitted && !paper && <p className="text-sm text-muted-foreground">جاوبت على {answered} من {items.length} سؤال.</p>}
      {items.map((item, index) => {
        const response = answers[item.id] ?? "";
        const mark = essayMarks[item.id];
        const choice = item.kind === "choice";
        const hasKey = choice ? item.options.includes(item.answer) : !!item.answer;
        return <fieldset disabled={grading.isPending} key={item.id} className="min-w-0 space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">سؤال {index + 1} · {choice ? "اختياري" : "مقالي"}</legend>
          <p className="whitespace-pre-wrap break-words font-medium" dir="auto">{item.question}</p>
          {!submitted && choice && item.options.map((option, i) => <label key={option} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
            <input className="mt-1 accent-primary" type="radio" name={item.id} checked={response === option} disabled={reading}
              onChange={() => setAnswers(previous => ({ ...previous, [item.id]: option }))} />
            <bdi>{letters[i]}</bdi><span dir="auto">{option}</span>
          </label>)}
          {!submitted && !choice && <Textarea value={response} aria-label={"إجابة السؤال " + (index + 1)}
            onChange={event => setAnswers(previous => ({ ...previous, [item.id]: event.target.value }))} />}
          {!submitted && !choice && paper && <p className="text-sm text-muted-foreground">اكتب إجابتك المقالي من الورقة هنا عشان تتصحّح بالذكاء الاصطناعي.</p>}
          {submitted && <>
            {aiGrades.filter(grade => grade.id === item.id).map(grade => <div key={grade.id} className="rounded-md bg-muted p-3">
              <p className="font-bold">تصحيح الذكاء الاصطناعي · {grade.score === null ? "محتاج مراجعة" : grade.score + "%"}</p>
              <p className="whitespace-pre-wrap text-sm">{grade.explanation}</p>
            </div>)}
            {(response || !paper || choice) && <p className="whitespace-pre-wrap break-words text-sm">إجابتك · {response || "من غير إجابة"}</p>}
            <p className="whitespace-pre-wrap break-words text-sm">الإجابة المحفوظة · {hasKey ? item.answer : "مفيش إجابة محفوظة"}</p>
            {choice && hasKey && !aiGrades.length && <p className="flex items-center gap-1 text-sm font-bold">{response === item.answer
              ? <><CheckCircle2 className="size-4 text-emerald-500" /> صح</>
              : <><XCircle className="size-4 text-destructive" /> {response ? "غلط" : "متساب"}</>}</p>}
            {!choice && hasKey && !aiGrades.length && (paper || response.trim()) && <div className="flex gap-2">
              {[true, false].map(value => <Button key={String(value)} type="button" size="sm" variant={mark === value ? "default" : "outline"}
                aria-pressed={mark === value} onClick={() => setEssayMarks(previous => ({ ...previous, [item.id]: value }))}>
                {value ? "إجابتي صح" : "إجابتي غلط"}
              </Button>)}
            </div>}
          </>}
        </fieldset>;
      })}
      {grading.error && <p role="alert" className="text-sm text-destructive">{grading.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        {submitted ? <>
          <Button type="button" onClick={onClose}>تم</Button>
          <Button type="button" variant="outline" onClick={() => { setSubmitted(false); setEssayMarks({}); grading.reset(); }}>ارجع للإجابات</Button>
        </> : <Button type="submit" disabled={reading || grading.isPending}>{grading.isPending ? "جارٍ التصحيح…" : paper ? "صحّح الإجابات" : "سلّم الامتحان واعرض النتيجة"}</Button>}
      </div>
    </form>}
  </ActionDialog>;
}
