import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Headphones, Pause, Play, Search, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import catalog from "@/lib/quranAudioCatalog.json";
import { money } from "@/lib/study";
import { useQuranPlayer } from "@/components/QuranPlayer";

const surahs = catalog.surahs;
const reciters = catalog.reciters;
const number = (id: number) => money.format(id);
const normalize = (value: string) => value.trim().replace(/[أإآٱ]/g, "ا").replace(/[\u064B-\u065F]/g, "");

export default function QuranAudio({ standalone = false }: { standalone?: boolean } = {}) {
  const player = useQuranPlayer();
  const { active, error, play } = player;
  const [query, setQuery] = useState("");
  const surah = active ? surahs[active - 1] : undefined;
  const matches = surahs.filter(item => normalize(item.name).includes(normalize(query)) || String(item.id) === query.trim() || number(item.id) === query.trim());

  return <div className="space-y-4" dir="rtl">
    <PageHeader title="القرآن الكريم" description="اختار السورة والقارئ واسمع التلاوة." />
    <section className="surface space-y-3 rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Headphones className="size-5 text-primary" />{surah ? "سورة " + surah.name : "اختار سورة للتشغيل"}</h2>
        <label className="flex items-center gap-2 text-sm">القارئ
          <select className="h-9 rounded-lg border bg-background px-2" value={player.reader} onChange={event => player.selectReader(Number(event.target.value))}>{reciters.map((item, index) => <option key={item.base} value={index}>{item.name}</option>)}</select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!active || active === 1} onClick={player.previous}><ChevronRight />السورة السابقة</Button>
        <Button size="sm" variant="outline" disabled={!active || (!player.shuffle && active === surahs.length)} onClick={player.next}>السورة التالية<ChevronLeft /></Button>
        {active && <Button size="sm" onClick={player.togglePlayback}>{player.playing ? <><Pause />إيقاف مؤقت</> : <><Play />تشغيل</>}</Button>}
        <Button size="sm" variant={player.shuffle ? "default" : "outline"} aria-pressed={player.shuffle} onClick={player.toggleShuffle}>
          <Shuffle />{player.shuffle ? "إيقاف العشوائي" : "شغّل سورة عشوائية"}
        </Button>
        {!standalone && <Button size="sm" variant="outline" onClick={player.openWindow}><ExternalLink />افتح المشغّل في نافذة مستقلة</Button>}
      </div>
      {error && <p role="status" className="text-sm">{error}</p>}
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
