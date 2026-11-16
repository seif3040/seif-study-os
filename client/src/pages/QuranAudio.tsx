import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Headphones, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import catalog from "@/lib/quranAudioCatalog.json";
import { money } from "@/lib/study";

const surahs = catalog.surahs;
const reciters = catalog.reciters;
const number = (id: number) => money.format(id);
const normalize = (value: string) => value.trim().replace(/[أإآٱ]/g, "ا").replace(/[\u064B-\u065F]/g, "");

export default function QuranAudio() {
  const audio = useRef<HTMLAudioElement>(null);
  const [query, setQuery] = useState("");
  const [reader, setReader] = useState(reciters[0].base);
  const [active, setActive] = useState<number>();
  const [error, setError] = useState(false);
  const surah = active ? surahs[active - 1] : undefined;
  const matches = surahs.filter(item => normalize(item.name).includes(normalize(query)) || String(item.id) === query.trim() || number(item.id) === query.trim());

  function play(id: number, base = reader) {
    const element = audio.current;
    if (!element) return;
    setError(false);
    setActive(id);
    element.src = new URL(String(id).padStart(3, "0") + ".mp3", base).href;
    void element.play().catch(() => {
      if (element.error) setError(true);
    });
  }

  return <div className="space-y-4" dir="rtl">
    <PageHeader title="القرآن الكريم" description="اختار السورة والقارئ واسمع التلاوة." />
    <section className="surface space-y-3 rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Headphones className="size-5 text-primary" />{surah ? "سورة " + surah.name : "اختار سورة للتشغيل"}</h2>
        <label className="flex items-center gap-2 text-sm">القارئ
          <select className="h-9 rounded-lg border bg-background px-2" value={reader} onChange={event => {
            setReader(event.target.value);
            if (active) play(active, event.target.value);
          }}>{reciters.map(item => <option key={item.base} value={item.base}>{item.name}</option>)}</select>
        </label>
      </div>
      <audio ref={audio} aria-label="مشغّل تلاوة القرآن" className="w-full" controls preload="none"
        onError={() => setError(true)} onEnded={() => { if (active && active < surahs.length) play(active + 1); }} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!active || active === 1} onClick={() => active && play(active - 1)}><ChevronRight />السورة السابقة</Button>
        <Button size="sm" variant="outline" disabled={!active || active === surahs.length} onClick={() => active && play(active + 1)}>السورة التالية<ChevronLeft /></Button>
      </div>
      {error && <p role="alert" className="text-sm">تعذّر تشغيل التلاوة. تأكد من الاتصال بالنت وجرّب تاني.</p>}
    </section>
    <section className="surface space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">السور · {number(surahs.length)}</h2>
        <div className="flex w-full max-w-xs items-center gap-2"><Search className="size-4" />
          <Input aria-label="ابحث عن سورة" placeholder="اسم السورة أو رقمها" value={query} onChange={event => setQuery(event.target.value)} />
        </div>
      </div>
      {!matches.length && <p className="text-sm text-muted-foreground">مفيش سور بتطابق البحث.</p>}
      <ol className="grid max-h-[52dvh] gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
        {matches.map(item => <li key={item.id}>
          <Button type="button" variant={active === item.id ? "default" : "outline"} aria-pressed={active === item.id}
            className="w-full justify-start" onClick={() => play(item.id)}>
            <span className="w-8 text-start tabular-nums">{number(item.id)}</span>{item.name}<Play className="ms-auto" />
          </Button>
        </li>)}
      </ol>
      <a className="text-sm text-primary underline" href="https://www.mp3quran.net/ar" target="_blank" rel="noreferrer">مصدر التلاوات · المكتبة الصوتية للقرآن الكريم</a>
    </section>
  </div>;
}
