import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, ScanText } from "lucide-react";
import ActionDialog from "@/components/ActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/lib/study";
import { mistakeSchema, type StudyResources } from "@shared/studyResources";

type Mistake = StudyResources["mistakes"][number];
export type MistakeLesson = { id: number; title: string; subjectId: number; subject: string; chapter?: string };
type Draft = Pick<Mistake, "id" | "subjectId" | "lessonId" | "kind" | "question" | "options" | "answer">;

const select = "h-10 w-full rounded-md border bg-background px-2";
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F]/g, "").replace(/[أإآ]/g, "ا");

export default function MistakeQuestionForm({ lessons, subjects, existing, saving, onSave, onClose }: {
  lessons: MistakeLesson[];
  subjects: [number, string][];
  existing?: Mistake;
  saving: boolean;
  onSave(draft: Draft): void;
  onClose(): void;
}) {
  const [lessonId, setLessonId] = useState(existing?.lessonId ?? 0);
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? 0);
  const [withoutLesson, setWithoutLesson] = useState(!!existing && !existing.lessonId);
  const [lookup, setLookup] = useState("");
  const [question, setQuestion] = useState(existing?.question ?? "");
  const [kind, setKind] = useState<Mistake["kind"]>(existing?.kind ?? "essay");
  const [choices, setChoices] = useState((existing?.options ?? []).join("\n"));
  const [answer, setAnswer] = useState(existing?.answer ?? "");
  const [preview, setPreview] = useState("");
  const [reading, setReading] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [error, setError] = useState("");
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const chosen = lessons.find(lesson => lesson.id === lessonId);
  const query = normalize(lookup.trim());
  const matches = lessons.filter(lesson => lesson.id !== lessonId && lesson.subjectId === subjectId && (!query ||
    normalize([lesson.title, lesson.chapter, lesson.subject].filter(Boolean).join(" ")).includes(query))).slice(0, 40);
  const visible = chosen ? [chosen, ...matches] : matches;
  const busy = saving || reading;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function usePhoto(file: File | undefined) {
    if (!file || busy) return;
    if (!/^image\/(?!svg\+xml)/i.test(file.type) && !(!file.type && /\.(?:jpe?g|png|webp|heic|heif|avif|bmp)$/i.test(file.name))) {
      setError("اختار صورة للسؤال.");
      return;
    }
    if (file.size > 24_000_000) {
      setError("اختار صورة أصغر من ٢٤ ميجابايت.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setWithoutLesson(false);
    setError("");
    setReadingProgress(0);
    setReading(true);
    try {
      const { readQuestionPhoto } = await import("@/lib/readQuestionPhoto");
      const subjectName = subjects.find(([id]) => id === subjectId)?.[1] ?? "";
      const latinSubject = /english|german|french|إنجليزي|انجليزي|الماني|ألماني|فرنساوي|فرنسي/i.test(subjectName);
      const result = await readQuestionPhoto(url, setReadingProgress, latinSubject);
      if (!result.question) throw new Error("النص مش واضح في الصورة. جرّب صورة أوضح أو اكتب السؤال يدويًا.");
      setQuestion(result.question);
      setKind(result.options.length > 1 ? "choice" : "essay");
      setChoices(result.options.join("\n"));
      setAnswer(result.answer);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setReading(false);
    }
  }

  function save() {
    setError("");
    if (withoutLesson ? !subjectId : !chosen) {
      setError(withoutLesson ? "اختار المادة." : "اختار اسم الدرس عشان نضيف السؤال.");
      return;
    }
    const options = kind === "choice" ? choices.split("\n").map(choice => choice.trim()).filter(Boolean) : [];
    const parsed = mistakeSchema.safeParse({ id: existing?.id ?? crypto.randomUUID(),
      subjectId: withoutLesson ? subjectId : chosen!.subjectId,
      lessonId: withoutLesson ? undefined : chosen!.id,
      kind, question, options, answer });
    if (!parsed.success) {
      setError(kind === "choice" ? "راجع نص السؤال والاختيارات والإجابة المحددة." : "راجع نص السؤال والإجابة.");
      return;
    }
    onSave(parsed.data);
  }

  return <ActionDialog title={existing ? "عدّل السؤال" : "ضيف سؤال غلطت فيه"} pending={busy} onClose={onClose}>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); save(); }}>
      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} variant="outline" onClick={() => gallery.current?.click()}><ImagePlus />اختار صورة</Button>
          <Button type="button" disabled={busy} variant="outline" onClick={() => camera.current?.click()}><Camera />صوّر السؤال</Button>
        </div>
        <input ref={gallery} type="file" accept="image/*" aria-label="اختار صورة السؤال" className="hidden" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void usePhoto(file);
        }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" aria-label="صوّر السؤال بالكاميرا" className="hidden" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void usePhoto(file);
        }} />
        {preview && <img src={preview} alt="صورة السؤال المختارة" className="max-h-48 w-full rounded-lg object-contain" />}
        {reading && <p role="status" className="flex items-center gap-2 text-sm"><ScanText className="size-4" />بنقرأ الصورة… {readingProgress > 0 ? readingProgress + "٪" : ""}</p>}
        <p className="text-xs text-muted-foreground">قراءة الصورة بتتم على جهازك. راجع النص قبل الحفظ.</p>
      </div>
      <fieldset disabled={busy} className="space-y-3">
        {!withoutLesson && <label className="grid gap-1 text-sm">المادة<select className={select} required value={subjectId} onChange={event => { setSubjectId(Number(event.target.value)); setLessonId(0); setLookup(""); }}><option value={0}>اختار المادة</option>{subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>}
        {withoutLesson ? <label className="grid gap-1 text-sm">المادة
          <select className={select} value={subjectId} onChange={event => setSubjectId(Number(event.target.value))}>
            <option value={0}>اختار المادة</option>{subjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </label> : <div className="space-y-2">
          <label className="grid gap-1 text-sm">اسم الدرس
            <Input type="search" value={lookup} onChange={event => setLookup(event.target.value)} placeholder="اكتب جزء من اسم الدرس" />
          </label>
          <select className={select} aria-label="اختار اسم الدرس" value={lessonId} onChange={event => setLessonId(Number(event.target.value))}>
            <option value={0}>{visible.length ? "اختار الدرس" : "مفيش درس مطابق"}</option>
            {visible.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.subject}{lesson.chapter ? " · " + lesson.chapter : ""}</option>)}
          </select>
          {chosen && <p className="text-xs text-muted-foreground">المادة · {chosen.subject}</p>}
        </div>}
        {!preview && <Button type="button" variant="ghost" size="sm" onClick={() => setWithoutLesson(value => !value)}>
          {withoutLesson ? "اربطه بدرس" : "احفظه في مادة من غير درس"}
        </Button>}
        <label className="grid gap-1 text-sm">نوع السؤال
          <select value={kind} className={select} onChange={event => {
            setKind(event.target.value === "choice" ? "choice" : "essay");
            setAnswer("");
          }}><option value="essay">مقالي</option><option value="choice">اختياري</option></select>
        </label>
        <label className="grid gap-1 text-sm">نص السؤال
          <Textarea required maxLength={1500} value={question} onChange={event => setQuestion(event.target.value)} />
        </label>
        {kind === "choice" && <label className="grid gap-1 text-sm">الاختيارات
          <Textarea required maxLength={1505} placeholder="كل اختيار في سطر" value={choices} onChange={event => {
            const previous = choices.split("\n").map(choice => choice.trim()).filter(Boolean);
            const next = event.target.value.split("\n").map(choice => choice.trim()).filter(Boolean);
            setChoices(event.target.value);
            if (answer && !next.includes(answer)) {
              const index = previous.indexOf(answer);
              setAnswer(index >= 0 && next.length === previous.length ? next[index] : "");
            }
          }} />
        </label>}
        <label className="grid gap-1 text-sm">الإجابة الصحيحة (اختياري)
          {kind === "choice" ? <select value={answer} onChange={event => setAnswer(event.target.value)} className={select}>
            <option value="">اكتبها بعدين</option>
            {Array.from(new Set(choices.split("\n").map(choice => choice.trim()).filter(Boolean))).map(choice => <option key={choice}>{choice}</option>)}
          </select> : <Textarea maxLength={1200} value={answer} onChange={event => setAnswer(event.target.value)} />}
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy} type="submit">احفظ السؤال</Button>
    </form>
  </ActionDialog>;
}
