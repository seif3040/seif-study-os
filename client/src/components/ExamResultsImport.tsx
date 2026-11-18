import { useState } from "react";
import { Button } from "@/components/ui/button";
import ActionDialog from "@/components/ActionDialog";
import { trpc } from "@/lib/trpc";
import { errorText } from "@/lib/study";
import { cairoPlannerTime } from "@shared/examSchedule";
import { plannerToday } from "@shared/studyPlanner";
import { parseCsv } from "@/components/CsvImport";
import { toast } from "sonner";

type Entry = { key: string; title: string; subject: string; day: string; correct: string; total: string; selected: boolean };
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export default function ExamResultsImport() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const readImage = trpc.exams.readResultsImage.useMutation();
  const [message, setMessage] = useState("");
  const auth = trpc.auth.me.useQuery();
  const subjects = trpc.studyPlan.list.useQuery();
  const exams = trpc.exams.list.useQuery();
  const utils = trpc.useUtils();
  const names = new Map((subjects.data?.rows ?? []).map(row => [normalize(row.subject.title), row.subject.id]));
  const edit = (key: string, patch: Partial<Entry>) =>
    setRows(items => items.map(item => item.key === key ? { ...item, ...patch } : item));

  function valid(row: Entry) {
    const date = new Date(row.day + "T12:00:00Z");
    return Boolean(row.title.trim() && row.title.length <= 200 && names.has(normalize(row.subject)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === row.day &&
      row.day >= "2020-01-01" && row.day <= plannerToday() && /^\d+$/.test(row.correct) && /^\d+$/.test(row.total) &&
      +row.total >= 1 && +row.total <= 500 && +row.correct <= +row.total);
  }

  function duplicate(row: Entry, existing = exams.data ?? []) {
    const subject = names.get(normalize(row.subject));
    return existing.some(item => (item.exam.subjectId === subject || normalize(item.subject ?? "") === normalize(row.subject)) &&
      normalize(item.exam.title) === normalize(row.title) &&
      item.attempts.some(attempt => attempt.date === row.day && attempt.score === Math.round(+row.correct * 100 / +row.total)));
  }

  async function load(file: File) {
    setMessage("");
    setRows([]);
    try {
      if (file.size > 256_000) throw new Error("اختار ملف حجمه أقل من ٢٥٦ كيلوبايت.");
      const [header, ...data] = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
      const columns = ["title", "subject", "date", "correct", "total"].map(field => header?.findIndex(column => normalize(column) === field) ?? -1);
      if (columns.includes(-1) || !data.length || data.length > 50) throw new Error("راجع أسماء الأعمدة، وحط من صف واحد لـ٥٠ صف.");
      setRows(data.map(line => {
        const [title, subject, day, correct, total] = columns.map(index => (line[index] ?? "").trim());
        return { key: crypto.randomUUID(), title, subject, day, correct, total, selected: true };
      }));
    } catch (error) { setMessage(errorText(error)); }
  }

  async function loadImage(file: File) {
    setReading(true);
    setMessage("");
    setRows([]);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) {
        throw new Error("اختار صورة PNG أو JPG أو WebP بحجم ٢ ميجابايت أو أقل.");
      }
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذّر فتح الصورة."));
        reader.readAsDataURL(file);
      });
      const results = await readImage.mutateAsync({ image });
      setRows(results.map(row => ({ ...row, key: crypto.randomUUID(), selected: false })));
      setMessage(results.length ? "راجع كل خانة واختار النتائج اللي عايز تحفظها." : "مفيش نتائج واضحة اتقرت من الصورة.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!auth.data || busy || !exams.data) return;
    setBusy(true);
    let saved = 0;
    try {
      let existing = await utils.client.exams.list.query();
      for (const row of rows.filter(item => item.selected && valid(item))) {
        if (duplicate(row, existing)) continue;
        const subjectId = names.get(normalize(row.subject))!;
        const match = existing.find(item => !item.exam.archivedAt && item.exam.subjectId === subjectId &&
          normalize(item.exam.title) === normalize(row.title));
        const exam = match?.exam ?? await utils.client.exams.create.mutate({ title: row.title.trim(), subjectId });
        await utils.client.exams.syncAttempt.mutate({
          ownerId: auth.data.id, key: row.key, examId: exam.id, totalQuestions: +row.total, correctAnswers: +row.correct,
          takenOn: row.day, completedAt: Math.min(Date.now(), +cairoPlannerTime(row.day, "12:00")), difficulty: "medium", missedTopics: [],
        });
        saved++;
        existing = await utils.client.exams.list.query();
      }
      setMessage("اتحفظ " + saved + " نتيجة جديدة.");
    } catch (error) {
      setMessage("اتحفظ " + saved + " نتيجة قبل التوقف. " + errorText(error));
      toast.error("تعذّر حفظ بعض النتائج.");
    } finally {
      await utils.invalidate();
      setBusy(false);
    }
  }

  return <div className="mb-4">
    <Button variant="outline" onClick={() => setOpen(true)}>استيراد درجات · CSV أو صورة</Button>
    {open && <ActionDialog title="استيراد درجات الامتحانات" pending={busy || reading} onClose={() => setOpen(false)}>
      <p className="text-sm">استخدم الأعمدة دي. اكتب اسم المادة زي ما هو في خطة المنهج.</p>
      <code className="block text-sm" dir="ltr">title,subject,date,correct,total</code>
      <input type="file" accept=".csv,text/csv" aria-label="ملف CSV" disabled={busy || reading} onChange={event => {
        const file = event.target.files?.[0];
        if (file) void load(file);
      }} />
      <label className="block space-y-1 text-sm">
        <span className="block font-semibold">قراءة درجات من صورة</span>
        <span className="block text-xs text-muted-foreground">اختيار صورة يرسلها لـ OpenRouter لقراءة الدرجات. اختار لقطة لجدول النتائج.</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="صورة نتائج الامتحانات" disabled={busy || reading}
          onChange={event => { const file = event.target.files?.[0]; if (file) void loadImage(file); }} />
      </label>
      {reading && <p role="status">بنقرأ الدرجات من الصورة…</p>}
      <div className="max-h-[45vh] space-y-2 overflow-auto">
        {rows.map(row => <div key={row.key} className="space-y-2 rounded-md border p-2">
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={row.selected} disabled={busy} onChange={event => edit(row.key, { selected: event.target.checked })} />
            {duplicate(row) ? "موجودة بالفعل" : valid(row) ? "جاهزة للحفظ" : "راجع البيانات"}
          </label>
          <div className="grid grid-cols-2 gap-1">
            {([["title", "الامتحان"], ["subject", "المادة"], ["day", "التاريخ"], ["correct", "الصح"], ["total", "الإجمالي"]] as const).map(([field, label]) =>
              <label key={field} className="text-xs">{label}
                <input className="block w-full rounded border bg-background p-1" value={row[field]} disabled={busy}
                  onChange={event => edit(row.key, { [field]: event.target.value })} />
              </label>)}
          </div>
        </div>)}
      </div>
      {message && <p role="status">{message}</p>}
      {rows.length > 0 && <p className="text-xs text-muted-foreground">الحفظ بيستخدم نقاط الامتحانات المعتادة، والصعوبة بتتسجل «متوسط».</p>}
      <Button disabled={busy || reading || !auth.data || !exams.data || !rows.some(row => row.selected && valid(row) && !duplicate(row))}
        onClick={() => void save()}>احفظ النتائج المحددة</Button>
    </ActionDialog>}
  </div>;
}
