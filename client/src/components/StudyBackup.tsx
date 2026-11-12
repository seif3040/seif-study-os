import StudyRestore from "@/components/StudyRestore";
import CsvImport from "@/components/CsvImport";
import { DatabaseBackup, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = typeof value === "string" && /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function csv<T>(rows: T[], keys: readonly (keyof T)[]) {
  return "\ufeff" + [keys.map(csvCell).join(","), ...rows.map(row => keys.map(key => csvCell(row[key])).join(","))].join("\r\n");
}

const formats = ["json", "tasks", "exams", "pomodoro"] as const;
type Format = typeof formats[number];
const labels: Record<Format, string> = {
  json: "تنزيل نسخة JSON",
  tasks: "المهام CSV",
  exams: "الامتحانات CSV",
  pomodoro: "جلسات البومودورو CSV",
};

export default function StudyBackup() {
  const backup = trpc.backup.export.useMutation();
  const daily = trpc.backup.daily.useQuery();
  const savedFile = trpc.backup.downloadDaily.useMutation();

  async function downloadSaved(id: number) {
    try {
      const result = await savedFile.mutateAsync({ backupId: id });
      download("seif-study-backup-" + result.day + ".json", result.archive, "application/json");
    } catch (error) { toast.error(errorText(error)); }
  }

  async function exportFile(format: Format) {
    try {
      const data = await backup.mutateAsync();
      const stamp = data.exportedAt.slice(0, 10);
      if (format === "json") {
        download("seif-study-backup-" + stamp + ".json", JSON.stringify(data, null, 2), "application/json");
      } else {
        const records = data.records;
        const content = {
          tasks: () => csv(records.tasks, ["id", "title", "description", "scheduledFor", "priority", "status"]),
          exams: () => csv(records.exams, ["id", "title", "subjectId", "scheduledAt", "archivedAt"]),
          pomodoro: () => csv(records.pomodoroSessions, ["id", "subjectId", "plannedMinutes", "completedMinutes", "state", "createdAt"]),
        };
        download(format + "-" + stamp + ".csv", content[format](), "text/csv;charset=utf-8");
      }
      toast.success("الملف جاهز للتنزيل");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return <section className="surface p-5 sm:p-6">
    <div className="mb-4 flex items-center gap-3">
      <span className="metric-icon bg-primary/10 text-primary"><DatabaseBackup /></span>
      <div><h2 className="font-bold">نسخة من بياناتك</h2><p className="text-sm text-muted-foreground">نزّل سجلات حسابك أو صدّر الجداول لاستخدامها في Excel.</p></div>
    </div>
    <div className="flex flex-wrap gap-2">
      {formats.map(format => <Button key={format} variant={format === "json" ? "default" : "outline"} disabled={backup.isPending} onClick={() => void exportFile(format)}><Download />{labels[format]}</Button>)}
    </div>
    <div className="mt-5 border-t pt-5">
      <h3 className="font-bold">النسخ التلقائية</h3>
      <p className="mt-1 text-sm text-muted-foreground">نسخة واحدة يوميًا أول ما تفتح الموقع وإنت متصل. النسخة بتتحفظ على الخادم وتقدر تنزّلها لجهازك.</p>
      {daily.isError ? <p className="text-sm">تعذّر تحميل النسخ.</p> : daily.data?.length ? <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium">آخر نسخة {daily.data[0].day}</summary>
        <ul className="mt-2 max-h-52 divide-y overflow-auto">{daily.data.map(item => <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span>{item.day}</span><Button size="sm" variant="ghost" disabled={savedFile.isPending} onClick={() => void downloadSaved(item.id)}>تنزيل</Button>
        </li>)}</ul>
      </details> : <p className="mt-2 text-sm text-muted-foreground">{daily.isLoading ? "جارٍ التحميل…" : "لسه مفيش نسخة تلقائية."}</p>}
    </div>
    <StudyRestore />
    <CsvImport />
  </section>;
}
