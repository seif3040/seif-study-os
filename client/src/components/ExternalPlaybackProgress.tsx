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
  const [progress, setProgress] = useState<PlaybackProgress>();
  useEffect(() => {
    const id = crypto.randomUUID();
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.id !== id ||
          event.data.type !== "seif-study-extension:progress") return;
      const data = event.data.data;
      if (data && Number.isFinite(data.watched) && Number.isFinite(data.manual) &&
          Array.isArray(data.ranges) && Array.isArray(data.notes)) setProgress(data);
    }
    function refresh() {
      window.postMessage({ type: "seif-study-extension:request", id, url }, location.origin);
    }
    window.addEventListener("message", receive);
    window.addEventListener("focus", refresh);
    refresh();
    const interval = window.setInterval(refresh, 6000);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [url]);

  return <div className="space-y-2 border-b p-4 text-sm">
    <h3 className="font-semibold">متابعة الفيديو من إضافة المتصفح</h3>
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
