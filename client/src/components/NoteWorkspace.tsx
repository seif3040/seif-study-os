import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";

type Card = { id: string; text: string; x: number; y: number; sticky: boolean };
type Stroke = { points: string; color: string; width: number; opacity: number };
type Board = { ink?: Stroke[]; cards: Card[]; links: [string, string][] };
const prefix = "study-board:v1:";
const audioPrefix = "study-audio:v1:";
function readBoard(value: string): Board {
  try { const board = JSON.parse(value.slice(prefix.length)); if (Array.isArray(board.cards) && Array.isArray(board.links)) return board; } catch {}
  return { cards: [], links: [] };
}
export function noteSummary(value: string) {
  if (value.startsWith(prefix)) return readBoard(value).cards.map(card => card.text).join("\n");
  return value.startsWith(audioPrefix) ? "ملاحظة صوتية" : value;
}
export function NoteContent({ value }: { value: string }) {
  if (value.startsWith(audioPrefix)) {
    const src = value.slice(audioPrefix.length);
    return /^data:audio\/(?:webm|ogg|mp4)(?:;codecs=[\w.-]+)?;base64,[A-Za-z0-9+/=]+$/.test(src)
      ? <audio controls className="w-full max-w-sm" src={src} /> : <p>التسجيل غير متاح.</p>;
  }
  if (value.startsWith(prefix)) return <Whiteboard value={value} />;
  return <p className="whitespace-pre-wrap text-sm">{value}</p>;
}
function Whiteboard({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const board = readBoard(value);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; rect: DOMRect } | undefined>(undefined);
  const [tool, setTool] = useState("move");
  const [color, setColor] = useState("#2563eb");
  const [zoom, setZoom] = useState(100);
  const [large, setLarge] = useState(false);
  const [draft, setDraft] = useState<Stroke>();
  const ink = useRef<Stroke | undefined>(undefined);
  const arrow = useId();
  const [selected, setSelected] = useState("");
  const [linking, setLinking] = useState("");
  const save = (next: Board) => onChange?.(prefix + JSON.stringify(next));
  function move(event: PointerEvent) {
    const item = drag.current;
    if (!item) return;
    const x = Math.max(0, Math.min(76, (event.clientX - item.rect.left - item.x) / item.rect.width * 100));
    const y = Math.max(0, Math.min(76, (event.clientY - item.rect.top - item.y) / item.rect.height * 100));
    save({ ...board, cards: board.cards.map(card => card.id === item.id ? { ...card, x, y } : card) });
  }
  function draw(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = Math.round((event.clientX - rect.left) * 1000 / rect.width) + "," +
      Math.round((event.clientY - rect.top) * 600 / rect.height);
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
      ink.current = { points: point + " " + point, color, width: tool === "highlight" ? 24 : 4, opacity: tool === "highlight" ? .32 : 1 };
    } else if (ink.current && ink.current.points.length < 6000) ink.current = { ...ink.current, points: ink.current.points + " " + point };
    setDraft(ink.current);
  }
  function finishInk() {
    if (!ink.current) return;
    const next = { ...board, ink: [...(board.ink ?? []), ink.current] };
    if ((prefix + JSON.stringify(next)).length <= 60000) save(next);
    else window.alert("اللوحة وصلت لحد الحفظ. افتح لوحة جديدة أو امسح آخر خط.");
    ink.current = undefined;
    setDraft(undefined);
  }
  function printBoard() {
    const popup = window.open("", "_blank");
    if (!popup || !surface.current) { window.alert("اسمح بفتح النوافذ المنبثقة للطباعة."); return; }
    const page = popup.document;
    page.title = "لوحة المذاكرة";
    const style = page.createElement("style");
    style.textContent = "@page{size:A4 landscape;margin:10mm}body{margin:0;font:14px Arial}svg{position:absolute;inset:0;width:100%;height:100%}textarea,button{display:none}.paper{position:relative;height:170mm;background:white;color:#111}.card{position:absolute;width:22%;padding:4px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #555;border-radius:6px;box-sizing:border-box;print-color-adjust:exact}";
    page.head.append(style);
    const paper = page.createElement("div"); paper.className = "paper";
    const svg = surface.current.querySelector("svg");
    if (svg) paper.append(svg.cloneNode(true));
    for (const card of board.cards) {
      const div = page.createElement("div");
      div.className = "card"; div.dir = "auto"; div.textContent = card.text;
      div.style.left = card.x + "%"; div.style.top = card.y + "%";
      div.style.background = card.sticky ? "#fde68a" : "#fff"; paper.append(div);
    }
    page.body.append(paper); popup.print();
  }
  return <div className={large ? "fixed inset-0 z-[60] overflow-auto bg-background p-4 space-y-2" : "space-y-2"}>
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => setLarge(!large)}>{large ? "رجوع" : "ملء الشاشة"}</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setZoom(Math.max(50, zoom - 25))}>−</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setZoom(100)}>{zoom}%</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setZoom(Math.min(250, zoom + 25))}>+</Button>
      <Button type="button" size="sm" variant="outline" onClick={printBoard}>طباعة / PDF</Button>
    </div>
    {onChange && <div className="flex flex-wrap items-center gap-1">
      {[["move", "تحريك"], ["pen", "قلم"], ["highlight", "هايلايتر"]].map(([key, label]) =>
        <Button key={key} type="button" size="sm" variant={tool === key ? "default" : "outline"} onClick={() => {
          setTool(key); if (key === "highlight") setColor("#facc15"); if (key === "pen") setColor("#2563eb");
        }}>{label}</Button>)}
      <input type="color" aria-label="لون القلم" value={color} onChange={event => setColor(event.target.value)} />
      <Button type="button" variant="ghost" size="sm" disabled={!board.ink?.length}
        onClick={() => save({ ...board, ink: board.ink?.slice(0, -1) })}>تراجع عن آخر خط</Button>
    </div>}
    {onChange && <div className="flex flex-wrap gap-1">
      {[false, true].map(sticky => <Button key={String(sticky)} size="sm" type="button" variant="outline" disabled={board.cards.length >= 30}
        onClick={() => {
          const id = crypto.randomUUID();
          const index = board.cards.length;
          save({ ...board, cards: [...board.cards, { id, text: sticky ? "ملاحظة" : "فكرة", sticky, x: 3 + (index % 4) * 24, y: 3 + (Math.floor(index / 4) % 4) * 24 }] });
          setSelected(id);
        }}>{sticky ? "+ Sticky Note" : "+ فكرة"}</Button>)}
      <Button type="button" size="sm" variant="outline" disabled={!selected} onClick={() => setLinking(linking ? "" : selected)}>{linking ? "اختار الفكرة التانية" : "اربط بفكرة"}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={!selected} onClick={() => {
        save({ ...board, cards: board.cards.filter(c => c.id !== selected), links: board.links.filter(pair => !pair.includes(selected)) });
        setSelected(""); setLinking("");
      }}>حذف الكارت</Button>
    </div>}
    <div className="overflow-auto rounded-xl border">
    <div ref={surface} dir="ltr" style={{ width: zoom + "%", height: (large ? 550 : 350) * zoom / 100 }}
      className="relative overflow-hidden bg-white text-slate-900">
      <svg aria-hidden="true" viewBox="0 0 1000 600" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full">
        <defs><marker id={arrow} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="#334155" />
        </marker></defs>
        {[...(board.ink ?? []), ...(draft ? [draft] : [])].map((stroke, index) => <polyline key={index}
          points={stroke.points} fill="none" stroke={stroke.color} strokeWidth={stroke.width} opacity={stroke.opacity} strokeLinecap="round" strokeLinejoin="round" />)}
        {board.links.map(([a, b]) => {
          const from = board.cards.find(card => card.id === a), to = board.cards.find(card => card.id === b);
          return from && to && <line key={a + b} x1={(from.x + 10) + "%"} y1={(from.y + 9) + "%"} x2={(to.x + 10) + "%"} y2={(to.y + 9) + "%"} stroke="#334155" strokeWidth="2" markerEnd={"url(#" + arrow + ")"} />;
        })}
      </svg>
      {board.cards.map(card => <div key={card.id} data-board-card={card.id} style={{ left: card.x + "%", top: card.y + "%" }}
        className={"absolute w-[23%] min-w-0 overflow-hidden rounded border shadow " + (card.sticky ? "bg-amber-200 text-slate-950" : "bg-card text-card-foreground") + (selected === card.id ? " ring-2 ring-primary" : "")}>
        {onChange && <button type="button" aria-label="حرّك أو اختار الكارت" className="w-full touch-none cursor-grab bg-black/10 text-center"
          onPointerDown={event => {
            if (!surface.current) return;
            if (linking) {
              if (linking !== card.id && !board.links.some(pair => pair.includes(linking) && pair.includes(card.id))) {
                save({ ...board, links: [...board.links, [linking, card.id]] });
              }
              setLinking(""); return;
            }
            setSelected(card.id);
            const rect = surface.current.getBoundingClientRect();
            drag.current = { id: card.id, rect, x: event.clientX - rect.left - rect.width * card.x / 100, y: event.clientY - rect.top - rect.height * card.y / 100 };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>⠿</button>}
        {onChange && <button type="button" className="absolute right-1 top-0 touch-none text-xs" aria-label="اسحب سهم لكارت تاني"
          onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerUp={event => {
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-board-card]")?.getAttribute("data-board-card");
            if (target && target !== card.id && !board.links.some(pair => pair[0] === card.id && pair[1] === target))
              save({ ...board, links: [...board.links, [card.id, target]] });
          }}>↗</button>}
        {onChange ? <textarea dir="auto" aria-label="نص الكارت" className="block h-14 w-full resize-none bg-transparent p-1 text-xs" value={card.text} maxLength={300}
          onFocus={() => setSelected(card.id)}
          onChange={event => save({ ...board, cards: board.cards.map(item => item.id === card.id ? { ...item, text: event.target.value } : item) })} />
          : <p dir="auto" className="whitespace-pre-wrap break-words p-2 text-xs">{card.text}</p>}
      </div>)}
      {onChange && tool !== "move" && <svg aria-label="مساحة الرسم" className="absolute inset-0 z-10 size-full touch-none cursor-crosshair"
        onPointerDown={draw} onPointerMove={event => { if (ink.current) draw(event); }} onPointerUp={finishInk} onPointerCancel={finishInk} />}
    </div></div>
  </div>;
}

export function NoteWorkspace({ value, onChange, onBusy }: { value: string; onChange(value: string): void; onBusy(value: boolean): void }) {
  const [emptyMode, setMode] = useState("text");
  const mode = value.startsWith(prefix) ? "board" : value.startsWith(audioPrefix) ? "voice" : value ? "text" : emptyMode;
  const drafts = useRef<Record<string, string>>({});

  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const timeout = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timeout.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      onBusy(false);
    };
  }, []);
  async function record() {
    setError("");
    setRecording(true);
    onBusy(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error();
      const active = new MediaRecorder(media, { mimeType, audioBitsPerSecond: 16000 });
      recorder.current = active;
      const chunks: Blob[] = [];
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      active.onstop = () => {
        window.clearTimeout(timeout.current);
        media.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!alive.current) return;
          const result = String(reader.result ?? "");
          if (!result || result.length + audioPrefix.length > 60000) setError("التسجيل طويل على الحفظ. جرّب تسجيل أقصر.");
          else onChange(audioPrefix + result);
          setRecording(false); onBusy(false);
        };
        reader.readAsDataURL(new Blob(chunks, { type: mimeType }));
      };
      active.start();
      timeout.current = window.setTimeout(() => { if (active.state === "recording") active.stop(); }, 15000);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      if (alive.current) { setRecording(false); onBusy(false); setError("تعذّر فتح المايك. راجع إذن الميكروفون في المتصفح."); }
    }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{[["text", "كتابة"], ["board", "وايت بورد / مايند ماب"], ["voice", "فويس"]].map(([key, label]) =>
      <Button size="sm" key={key} type="button" disabled={recording} variant={mode === key ? "default" : "outline"} onClick={() => {
        if (mode === key) return;
        drafts.current[mode] = value;
        onChange(drafts.current[key] ?? (key === "board" ? prefix + JSON.stringify({ cards: [], links: [] }) : ""));
        setMode(key);
      }}>{label}</Button>)}</div>
    {mode === "text" && <textarea className="min-h-32 w-full rounded-md border bg-background p-3" placeholder="اكتب ملاحظاتك من الفيديو…" value={value} onChange={e => onChange(e.target.value)} />}
    {mode === "board" && <Whiteboard value={value} onChange={onChange} />}
    {mode === "voice" && <div className="space-y-2">
      <p className="text-sm">سجّل ملاحظة صوتية لحد ١٥ ثانية.</p>
      <Button size="sm" type="button" onClick={() => recording ? recorder.current?.state === "recording" && recorder.current.stop() : void record()}>{recording ? "وقف التسجيل" : "سجّل صوت"}</Button>
      {value.startsWith(audioPrefix) && <NoteContent value={value} />}
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
