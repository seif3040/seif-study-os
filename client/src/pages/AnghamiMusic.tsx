import { useState, type FormEvent } from "react";
import { ExternalLink, Music2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const player = "https://play.anghami.com";
const storageKey = "seif-anghami-link";

function mediaPath(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.origin !== player || url.username || url.password) return;
    return url.pathname.match(/^\/(song|album|playlist|artist)\/\d+\/?$/)?.[0].replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export default function AnghamiMusic() {
  const [path, setPath] = useState(() => {
    try {
      return mediaPath(localStorage.getItem(storageKey) ?? "");
    } catch {
      return undefined;
    }
  });
  const [link, setLink] = useState(path ? player + path : "");
  const [error, setError] = useState(false);

  function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPath = mediaPath(link);
    setError(!nextPath);
    if (!nextPath) return;
    setPath(nextPath);
    try {
      localStorage.setItem(storageKey, player + nextPath);
    } catch {
      // Playback is available when local storage is disabled.
    }
  }

  return <div dir="rtl" className="space-y-4">
    <PageHeader title="أغاني" description="افتح أغنية أو قائمة تشغيل من أنغامي أثناء المذاكرة." />
    <section className="surface space-y-4 p-4 md:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Music2 className="size-5 text-primary" />أنغامي</h2>
      <form onSubmit={load} className="space-y-2">
        <label htmlFor="anghami-link" className="text-sm font-medium">رابط أغنية أو ألبوم أو قائمة تشغيل أو فنان</label>
        <div className="flex flex-wrap gap-2">
          <Input id="anghami-link" type="url" dir="ltr" className="min-w-48 flex-1" required value={link}
            placeholder="https://play.anghami.com/playlist/…" onChange={event => { setLink(event.target.value); setError(false); }} />
          <Button type="submit">افتح المشغّل</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">انسخ رابط المشاركة الكامل من play.anghami.com.</p>}
      </form>
      {path && <iframe key={path} title="مشغّل أنغامي" src={`https://widget.anghami.com${path}`}
        className="w-full max-w-[680px] rounded-xl border bg-background"
        height={path.startsWith("/song/") ? 190 : 580}
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms" allow="autoplay; encrypted-media" />}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline"><a href={player + (path ?? "/home")} target="_blank" rel="noreferrer"><ExternalLink />{path ? "كمّل على أنغامي" : "افتح حسابك على أنغامي"}</a></Button>
        <p className="text-sm text-muted-foreground">المشغّل المدمج ممكن يشغّل معاينة. مكتبتك والتشغيل الكامل متاحين في مشغّل أنغامي بحسابك.</p>
      </div>
    </section>
  </div>;
}
