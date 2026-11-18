import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import catalog from "@/lib/quranAudioCatalog.json";

const { surahs, reciters } = catalog;
const transferMessage = "seif-quran-playing";

function launchState() {
  const params = new URLSearchParams(location.search);
  const reader = Number(params.get("reader"));
  const id = Number(params.get("surah"));
  const seconds = Number(params.get("at"));
  return {
    reader: Number.isInteger(reader) && reciters[reader] ? reader : 0,
    id: Number.isInteger(id) && surahs[id - 1]?.id === id ? id : undefined,
    seconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : 0,
    shuffle: params.get("shuffle") === "1",
    autoplay: params.get("play") === "1",
  };
}

type Player = {
  active?: number;
  reader: number;
  shuffle: boolean;
  playing: boolean;
  error: string;
  play(id: number): void;
  selectReader(index: number): void;
  toggleShuffle(): void;
  togglePlayback(): void;
  next(): void;
  previous(): void;
  openWindow(): void;
};

const QuranPlayer = createContext<Player | null>(null);

export function useQuranPlayer() {
  const player = useContext(QuranPlayer);
  if (!player) throw new Error("Quran player is unavailable");
  return player;
}

function randomSurah(current?: number) {
  const candidates = surahs.filter(item => item.id !== current);
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

export function QuranPlayerProvider({ children, standalone }: { children: ReactNode; standalone: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const popup = useRef<Window | null>(null);
  const transferSent = useRef(false);
  const request = useRef(0);
  const [initial] = useState(launchState);
  const [active, setActive] = useState<number>();
  const [reader, setReader] = useState(standalone ? initial.reader : 0);
  const [shuffle, setShuffle] = useState(standalone && initial.shuffle);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  function start(element: HTMLAudioElement) {
    const current = ++request.current;
    void element.play().catch(cause => {
      if (current !== request.current || cause?.name === "AbortError") return;
      setError(cause?.name === "NotAllowedError" ? "اضغط تشغيل عشان تكمّل التلاوة." : "تعذّر تشغيل التلاوة. تأكد من الاتصال وجرّب تاني.");
    });
  }

  function load(id: number, index: number, seconds = 0, autoplay = true) {
    const element = audio.current;
    if (!element) return;
    request.current++;
    setError("");
    setActive(id);
    element.src = new URL(String(id).padStart(3, "0") + ".mp3", reciters[index].base).href;
    if (seconds) element.currentTime = seconds;
    if (autoplay) start(element);
  }

  useEffect(() => {
    if (standalone && initial.id) load(initial.id, initial.reader, initial.seconds, initial.autoplay);
  }, [standalone, initial]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== location.origin) return;
      const handoff = popup.current && event.source === popup.current && event.data === transferMessage;
      const resumeOnSite = standalone && window.opener && event.source === window.opener && event.data === "seif-quran-pause";
      if (resumeOnSite) transferSent.current = false;
      if (handoff || resumeOnSite) audio.current?.pause();
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [standalone]);

  function openWindow() {
    if (popup.current && !popup.current.closed) {
      popup.current.focus();
      return;
    }
    const params = new URLSearchParams({ player: "1", reader: String(reader), shuffle: shuffle ? "1" : "0" });
    if (active) {
      params.set("surah", String(active));
      params.set("at", String(audio.current?.currentTime ?? 0));
      if (playing) params.set("play", "1");
    }
    const opened = window.open("/quran?" + params, "seif-quran-player", "popup,width=520,height=740");
    if (opened) {
      popup.current = opened;
      opened.focus();
    } else {
      setError("اسمح بالنوافذ المنبثقة عشان تفتح مشغّل القرآن المستقل.");
    }
  }

  function next() {
    if (shuffle) load(randomSurah(active), reader);
    else if (active && active < surahs.length) load(active + 1, reader);
  }

  return <QuranPlayer.Provider value={{
    active, reader, shuffle, playing, error,
    play: id => load(id, reader),
    selectReader: index => {
      setReader(index);
      if (active) load(active, index, 0, playing);
    },
    toggleShuffle: () => {
      setShuffle(!shuffle);
      if (!shuffle) load(randomSurah(active), reader);
    },
    togglePlayback: () => {
      const element = audio.current;
      if (!element || !active) return;
      if (element.paused) { setError(""); start(element); }
      else element.pause();
    },
    next, previous: () => { if (active && active > 1) load(active - 1, reader); },
    openWindow,
  }}>
    {children}
    <aside dir="rtl" hidden={!active} aria-label="مشغّل تلاوة القرآن"
      className={standalone ? "surface mx-auto mb-4 max-w-lg p-3" : "surface fixed bottom-20 left-3 right-3 z-30 flex flex-wrap items-center gap-2 rounded-xl p-2 shadow-lg md:bottom-4 md:left-4 md:right-auto md:w-[26rem]"}>
      <div className="flex w-full items-center justify-between gap-2 px-1">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><Headphones className="size-4 shrink-0 text-primary" />{active && "سورة " + surahs[active - 1].name}</span>
        {!standalone && <Button variant="ghost" size="sm" onClick={openWindow}><ExternalLink />نافذة مستقلة</Button>}
      </div>
      <audio ref={audio} controls preload="metadata" aria-label="تلاوة القرآن" className="w-full"
        onPlaying={() => {
          setPlaying(true);
          setError("");
          if (standalone && !transferSent.current && window.opener) {
            transferSent.current = true;
            window.opener.postMessage(transferMessage, location.origin);
          }
          if (!standalone && popup.current && !popup.current.closed) {
            popup.current.postMessage("seif-quran-pause", location.origin);
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); next(); }}
        onError={() => {
          setPlaying(false);
          setError("تعذّر تشغيل التلاوة. تأكد من الاتصال وجرّب تاني.");
        }} />
    </aside>
  </QuranPlayer.Provider>;
}
