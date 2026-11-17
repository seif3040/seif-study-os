import { useEffect, useState } from "react";

type PlaybackProgress = {
  position?: number;
  watched: number;
  manual: number;
  ranges: [number, number][];
  notes: { text: string; position: number | null; at: number }[];
};

function clock(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, "0")).join(":");
}

export default function ExternalPlaybackProgress({ url }: { url: string }) {
  const key = "study-extension-lesson:" + url;
  const [linkedUrl, setLinkedUrl] = useState(() => localStorage.getItem(key) ?? "");
  const [lessons, setLessons] = useState<{ url: string; title: string; position?: number }[]>([]);
  const [progress, setProgress] = useState<PlaybackProgress>();
  useEffect(() => {
    const id = crypto.randomUUID();
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.id !== id ||
          event.data.type !== "seif-study-extension:progress") return;
      const data = event.data.data;
      if (event.data.list && Array.isArray(data)) {
        setLessons(data);
        return;
      }
      if (data && Number.isFinite(data.watched) && Number.isFinite(data.manual) &&
          Array.isArray(data.ranges) && Array.isArray(data.notes)) setProgress(data);
    }
    function refresh() {
      window.postMessage({ type: "seif-study-extension:request", id, url: linkedUrl || url }, location.origin);
    }
    function refreshLessons() {
      refresh();
      window.postMessage({ type: "seif-study-extension:request", id, url, list: true }, location.origin);
    }
    window.addEventListener("message", receive);
    window.addEventListener("focus", refreshLessons);
    refreshLessons();
    const interval = window.setInterval(refresh, 6000);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", refreshLessons);
      window.clearInterval(interval);
    };
  }, [url, linkedUrl]);

  return <div className="space-y-2 border-b p-4 text-sm">
    <h3 className="font-semibold">متابعة الفيديو من إضافة المتصفح</h3>
    {lessons.length > 0 && <label className="grid gap-1">
      اربط جلسة الموقع بالدرس المحفوظ في الإضافة
      <select className="rounded-md border bg-background p-2" value={linkedUrl} onChange={event => {
        const choice = event.target.value;
        setProgress(undefined);
        setLinkedUrl(choice);
        if (choice) localStorage.setItem(key, choice);
        else localStorage.removeItem(key);
      }}>
        <option value="">استخدم رابط الجلسة الحالي</option>
        {lessons.map(lesson => <option key={lesson.url} value={lesson.url}>
          {lesson.title} · {new URL(lesson.url).pathname.split("/").filter(Boolean).at(-1)}{lesson.position !== undefined ? " · " + clock(lesson.position) : ""}
        </option>)}
      </select>
    </label>}
    {linkedUrl && <a href={linkedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">افتح الدرس المرتبط</a>}
    {progress ? <>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>آخر مكان <b dir="ltr">{progress.position === undefined ? "—" : clock(progress.position)}</b></span>
        <span>المشاهدة <b dir="ltr">{clock(progress.watched)}</b></span>
        {progress.manual > 0 && <span>المؤقت اليدوي <b dir="ltr">{clock(progress.manual)}</b></span>}
      </div>
      {progress.ranges.length > 0 && <details>
        <summary className="cursor-pointer">الأجزاء اللي اتفرجت عليها</summary>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="أجزاء المشاهدة">
          {progress.ranges.map(([start, end]) => <li key={start} dir="ltr" className="rounded-md bg-muted px-2 py-1">{clock(start)} – {clock(end)}</li>)}
        </ul>
      </details>}
      {progress.notes.length > 0 && <details>
        <summary className="cursor-pointer">ملاحظات الفيديو</summary>
        <ul className="mt-2 space-y-2">
          {progress.notes.map((note, index) => <li key={note.at + ":" + index} className="break-words">
            {note.position !== null && <b dir="ltr" className="me-2">{clock(note.position)}</b>}{note.text}
          </li>)}
        </ul>
      </details>}
      <p className="text-muted-foreground">افتح الدرس في منصته، ومن أيقونة الإضافة اضغط «كمّل من آخر مكان».</p>
    </> : <p className="text-muted-foreground">ثبّت الإضافة وفعّلها على صفحة الدرس عشان يظهر تقدّمك هنا.</p>}
    <a href="/seif-study-extension.zip" download className="inline-flex font-semibold text-primary underline">نزّل إضافة المتصفح</a>
  </div>;
}
