import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";

const priorities = ["urgent", "medium", "low"] as const;
type Priority = typeof priorities[number];
type Kind = "tasks" | "exams";
type Row = { title: string; day?: string; priority: Priority };
type Preview = Row & { duplicate: boolean };

function parseCsv(source: string) {
  const lines: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  function finishField() { fields.push(field); field = ""; closed = false; }
  function finishLine() {
    finishField();
    if (fields.some(value => value.trim())) lines.push(fields);
    fields = [];
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') { field += '"'; index++; }
      else { quoted = false; closed = true; }
    } else if (char === ",") finishField();
    else if (char === "\r" || char === "\n") {
      finishLine();
      if (char === "\r" && source[index + 1] === "\n") index++;
    } else if (!closed && !field && char === '"') quoted = true;
    else if (closed || char === '"') throw new Error("فيه علامات اقتباس غير صحيحة في الملف.");
    else field += char;
  }
  if (quoted) throw new Error("فيه خانة نص مفتوحة في آخر الملف.");
  finishLine();
  return lines;
}

function rowsFromFile(source: string, kind: Kind): Row[] {
  const [header, ...lines] = parseCsv(source.replace(/^\uFEFF/, ""));
  const columns = header?.map(value => value.trim().toLowerCase()) ?? [];
  const titleIndex = columns.indexOf("title");
  const dateIndex = columns.findIndex(value => value === "date" || value === (kind === "tasks" ? "scheduledfor" : "scheduledat"));
  const priorityIndex = columns.indexOf("priority");
  if (titleIndex < 0 || !lines.length || lines.length > 250) throw new Error("الملف لازم يحتوي على عمود title ومن صف واحد لحد ٢٥٠ صف.");
  return lines.map((line, index) => {
    const title = line[titleIndex]?.trim();
    const rawDate = line[dateIndex]?.trim();
    const day = rawDate?.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
    const parsedDate = day ? new Date(day + "T00:00:00Z") : null;
    const priority = line[priorityIndex]?.trim() || "medium";
    if (line.length !== columns.length || !title || title.length > 200 || (rawDate && (!day || !parsedDate || !Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== day)) || !priorities.includes(priority as Priority)) {
      throw new Error("راجع العنوان والتاريخ والأولوية في صف البيانات رقم " + (index + 1) + ".");
    }
    return { title, day, priority: priority as Priority };
  });
}

export default function CsvImport() {
  const [kind, setKind] = useState<Kind>("tasks");
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [reading, setReading] = useState(false);
  const save = trpc.backup.importCsv.useMutation();
  const utils = trpc.useUtils();
  const busy = reading || save.isPending;
  const fresh = preview.filter(row => !row.duplicate).length;

  async function read(file: File) {
    setRows([]); setPreview([]); setReading(true);
    try {
      if (file.size > 500_000) throw new Error("حجم الملف أكبر من ٥٠٠ كيلوبايت.");
      const parsed = rowsFromFile(await file.text(), kind);
      const result = await save.mutateAsync({ kind, rows: parsed, preview: true });
      setRows(parsed);
      setPreview(result.rows.map(row => ({ ...row, day: row.day ?? undefined })));
    } catch (error) { toast.error(errorText(error)); }
    finally { setReading(false); }
  }

  async function confirm() {
    try {
      const result = await save.mutateAsync({ kind, rows, preview: false });
      setPreview([]); setRows([]);
      toast.success("عدد السجلات اللي اتضافت: " + result.added);
      await utils.invalidate();
    } catch (error) { toast.error(errorText(error)); }
  }

  return <div className="mt-5 border-t pt-5">
    <h3 className="flex items-center gap-2 font-bold"><Upload className="size-4" />استيراد من CSV</h3>
    <p className="my-2 text-sm text-muted-foreground">الأعمدة هي title وdate، وللمهام ممكن تضيف priority. اكتب التاريخ بصيغة YYYY-MM-DD. الاستيراد بيضيف العناوين والمواعيد وأولوية المهام. الامتحان اللي له تاريخ هيتحط الساعة ١٢ ظهرًا بتوقيت القاهرة.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="نوع الاستيراد" value={kind} disabled={busy} className="rounded-lg border bg-background px-3" onChange={event => { setKind(event.target.value as Kind); setRows([]); setPreview([]); }}>
        <option value="tasks">المهام</option><option value="exams">الامتحانات</option>
      </select>
      <a className="self-center text-sm font-semibold text-primary underline" download={kind + "-template.csv"} href={"data:text/csv;charset=utf-8," + encodeURIComponent(kind === "tasks" ? "title,date,priority\r\n" : "title,date\r\n")}>تنزيل القالب</a>
      <Input className="w-auto" type="file" aria-label="ملف CSV" accept=".csv,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        if (file) void read(file);
        event.target.value = "";
      }} />
    </div>
    {preview.length > 0 && <div className="mt-4">
      <p className="mb-2 text-sm">{fresh} هيتضافوا، و{preview.length - fresh} مكررين هيتخطّوا.</p>
      <ul className="max-h-56 divide-y overflow-auto rounded-lg border">{preview.map((row, index) => <li key={index} className="flex flex-wrap justify-between gap-2 p-2 text-sm"><span>{row.title}</span><span className="text-muted-foreground">{row.duplicate ? "مكرر" : row.day || "من غير تاريخ"}</span></li>)}</ul>
      <Button className="mt-3" disabled={busy || fresh === 0} onClick={() => void confirm()}>تأكيد الاستيراد</Button>
    </div>}
  </div>;
}
