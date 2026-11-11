import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { Headphones, MessageSquare, Mic, Plus, Send, Sparkles, Square } from "lucide-react";
import { ActionPreview, type Plan } from "@/components/PersonalAssistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArabicVoice } from "@/hooks/useArabicVoice";
import { errorText } from "@/lib/study";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

async function toSamples(blob: Blob) {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); }
  finally { await context.close(); }
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

type Mode = "text" | "dictate" | "live";

export default function Seify() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const from = new URLSearchParams(useSearch()).get("from") ?? "/";
  const [chat, setChat] = useState<number>();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [shareText, setShareText] = useState(false);
  const [shareHistory, setShareHistory] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const worker = useRef<Worker | null>(null);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [outgoing, setOutgoing] = useState("");
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const active = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const { voices, speak } = useArabicVoice();

  const chats = trpc.personalAssistant.chats.useQuery();
  const messages = trpc.personalAssistant.chatMessages.useQuery({ chatId: chat });
  const create = trpc.personalAssistant.createChat.useMutation();
  const ask = trpc.personalAssistant.plan.useMutation();

  const execute = trpc.personalAssistant.execute.useMutation();

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      worker.current?.terminate();
      worker.current = null;
      window.clearTimeout(timer.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.data, outgoing, plan]);

  function switchChat(id?: number) {
    setChat(id); setDraft(""); setPlan(null); setVoiceError(""); setShareHistory(false);
    window.speechSynthesis?.cancel();
  }

  async function newChat() {
    try {
      const result = await create.mutateAsync();
      switchChat(result.id);
      await utils.personalAssistant.chats.invalidate();
    } catch (error) { toast.error(errorText(error)); }
  }

  async function send(value: string, speakReply: boolean) {
    const request = value.trim();
    if (!request || !shareText || ask.isPending) return;
    setOutgoing(request); setPlan(null); setDraft("");
    try {
      const result = await ask.mutateAsync({ request, page: from, shareWithOpenRouter: true, chatId: chat, includeChatHistory: shareHistory });
      setPlan(result);
      if (speakReply) {
        const playback = speak(result.reply);
        if (!playback.played) setVoiceError(playback.message);
      }
      await Promise.all([utils.personalAssistant.chatMessages.invalidate({ chatId: chat }), utils.personalAssistant.chats.invalidate()]);
    } catch (error) {
      toast.error(errorText(error)); setDraft(request);
    } finally { setOutgoing(""); }
  }

  async function record() {
    if ((mode === "live" && !shareText) || preparing || recording || ask.isPending) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError("المتصفح ده مش بيدعم تسجيل الصوت. افتح الموقع في Chrome أو Edge أو Safari حديث.");
      return;
    }
    setVoiceError(""); setPreparing(true);
    window.speechSynthesis?.cancel();
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!active.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const capture = new MediaRecorder(input);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = async () => {
        input.getTracks().forEach(track => track.stop());
        window.clearTimeout(timer.current);
        if (!active.current) return;
        setRecording(false);
        setPreparing(true);
        try {
          if (!chunks.length) throw new Error("التسجيل طلع فاضي. جرّب تاني.");
          const samples = await toSamples(new Blob(chunks, { type: capture.mimeType }));
          if (!active.current) return;
          const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
          if (peak < 0.001) throw new Error("التسجيل مافيهوش صوت واضح. راجع المايك المختار.");
          setVoiceStatus("جارٍ تجهيز نموذج الصوت على الجهاز…");
          const text = await transcribeLocally(samples);
          if (!active.current) return;
          if (mode === "dictate") setDraft(previous => [previous.trim(), text].filter(Boolean).join(" ").slice(0, 1200));
          else await send(text, true);
        } catch (error) {
          if (active.current) setVoiceError(errorText(error));
        } finally {
          if (active.current) { setPreparing(false); setVoiceStatus(""); }
        }
      };
      capture.start();
      setRecording(true);
      timer.current = window.setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 25_000);
      setPreparing(false);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop());
      setPreparing(false);
      setVoiceError(error instanceof DOMException && error.name === "NotAllowedError"
        ? "إذن المايك مقفول. اسمح بالميكروفون من إعدادات الموقع أو افتحه في المتصفح."
        : "مش قادر أوصل للمايك. راجع الجهاز المختار وإعدادات الصوت.");
    }
  }

  function transcribeLocally(samples: Float32Array) {
    const instance = worker.current ?? new Worker(new URL("../lib/seifyVoice.worker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    return new Promise<string>((resolve, reject) => {
      const deadline = window.setTimeout(() => {
        instance.terminate();
        if (worker.current === instance) worker.current = null;
        reject(new Error("تحميل نموذج الصوت أخد وقت طويل. اتأكد من الاتصال وجرّب تاني."));
      }, 180_000);
      instance.onmessage = event => {
        const value = event.data as { status: "loading" | "working" | "done" | "error"; text?: string; progress?: number };
        if (value.status === "loading") {
          if (value.progress !== undefined) setVoiceStatus("تحميل نموذج الصوت: " + Math.round(value.progress) + "%");
          return;
        }
        if (value.status === "working") { setVoiceStatus("بحوّل التسجيل لكتابة على جهازك…"); return; }
        window.clearTimeout(deadline);
        if (value.status === "done" && value.text) resolve(value.text);
        else reject(new Error(value.text ?? "تعذّر تشغيل نموذج الصوت على الجهاز."));
      };
      instance.onerror = () => {
        window.clearTimeout(deadline);
        instance.terminate();
        if (worker.current === instance) worker.current = null;
        reject(new Error("المتصفح ماقدرش يشغّل نموذج الصوت على الجهاز."));
      };
      instance.postMessage(samples, [samples.buffer]);
    });
  }

  async function apply() {
    if (!plan || execute.isPending) return;
    try {
      const result = await execute.mutateAsync({ plan: plan as Parameters<typeof execute.mutateAsync>[0]["plan"], confirmed: true, chatId: chat });
      setPlan(null);
      if (mode === "live") speak(result.message);
      await utils.invalidate();
    } catch (error) { toast.error(errorText(error)); }
  }

  const busy = ask.isPending || recording || preparing || execute.isPending || create.isPending;
  const canRecord = mode !== "live" || shareText;
  return <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <aside className="surface min-w-0 p-3">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-bold">المحادثات</h2><Button size="sm" disabled={busy} onClick={() => void newChat()}><Plus />شات جديد</Button></div>
      <nav aria-label="محادثات سيفي" className="flex gap-2 overflow-x-auto lg:max-h-[64vh] lg:flex-col lg:overflow-y-auto">
        <Button variant={chat === undefined ? "secondary" : "ghost"} className="justify-start" disabled={busy} onClick={() => switchChat()}><MessageSquare />المحادثة السابقة</Button>
        {(chats.data ?? []).map(item => <Button key={item.id} variant={chat === item.id ? "secondary" : "ghost"} className="max-w-56 justify-start lg:max-w-none" disabled={busy} onClick={() => switchChat(item.id)}><MessageSquare /><span className="truncate">{item.title}</span></Button>)}
      </nav>
      {chats.isError && <button className="mt-2 text-xs text-primary" onClick={() => void chats.refetch()}>إعادة تحميل المحادثات</button>}
    </aside>
    <section className="surface flex min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h1 className="flex items-center gap-2 text-xl font-bold"><Sparkles className="text-primary" />سيفي AI</h1>
        <div role="group" aria-label="طريقة المحادثة" className="flex flex-wrap gap-1">
          {([["text", "كتابة"], ["dictate", "Dictate"], ["live", "Live Speak"]] as const).map(([value, label]) =>
            <Button key={value} size="sm" variant={mode === value ? "secondary" : "ghost"} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setVoiceError(""); window.speechSynthesis?.cancel(); }}>{label}</Button>)}
        </div>
      </header>
      <div className="max-h-[52vh] min-h-56 flex-1 space-y-3 overflow-auto p-4 sm:p-6" role="log" aria-label="رسائل المحادثة">
        {messages.isLoading && <p className="text-sm text-muted-foreground">جارٍ تحميل الرسائل…</p>}
        {messages.isError && <button className="text-sm text-primary" onClick={() => void messages.refetch()}>تعذّر التحميل. جرّب تاني.</button>}
        {!messages.isLoading && !messages.isError && !messages.data?.length && !outgoing && <p className="text-sm text-muted-foreground">ابدأ بسؤال، أو اطلب من سيفي يساعدك في خطة المذاكرة.</p>}
        {messages.data?.map(message => <p key={message.id} className={"max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm " + (message.role === "user" ? "ms-auto bg-primary text-primary-foreground" : "me-auto bg-muted")}>{message.content}</p>)}
        {outgoing && <p className="ms-auto max-w-[90%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">{outgoing}</p>}
        {ask.isPending && <p className="text-sm text-muted-foreground">سيفي بيجهّز الرد…</p>}
        {plan && <ActionPreview plan={plan} loading={execute.isPending} onConfirm={() => void apply()} onNavigate={() => { if (plan.route) navigate(plan.route); setPlan(null); }} />}
        <div ref={bottom} />
      </div>
      <div className="space-y-3 border-t p-4">
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <label className="flex items-start gap-2"><input type="checkbox" checked={shareText} disabled={busy} onChange={e => setShareText(e.target.checked)} /><span>أوافق على إرسال الرسالة الحالية واسم الصفحة إلى OpenRouter للرد.</span></label>
          {chat !== undefined && shareText && <label className="flex items-start gap-2"><input type="checkbox" checked={shareHistory} disabled={busy} onChange={e => setShareHistory(e.target.checked)} /><span>أوافق على إرسال آخر ٨ رسائل من المحادثة دي للسياق.</span></label>}
          {mode !== "text" && <p>الصوت بيتحوّل لنص على جهازك. أول مرة تحتاج تنزيل نموذج الصوت.</p>}
        </div>
        {mode !== "text" && <div className="flex flex-wrap items-center gap-2">
          <Button variant={recording ? "destructive" : "outline"} disabled={!recording && (busy || !canRecord)} onClick={() => recording ? recorder.current?.stop() : void record()}>
            {recording ? <Square /> : mode === "live" ? <Headphones /> : <Mic />}
            {recording ? "إيقاف التسجيل" : preparing ? (voiceStatus || "جارٍ تجهيز الصوت…") : mode === "live" ? "اتكلم مع سيفي" : "ابدأ الإملاء"}
          </Button>
          <span className="text-xs text-muted-foreground">{recording ? "المايك شغال، الحد الأقصى ٢٥ ثانية." : mode === "dictate" ? "النص هيتكتب في خانة الرسالة." : "كل تسجيل بيتبعت كرسالة، وسيفي هيرد بصوت لو الجهاز فيه صوت عربي."}</span>
        </div>}
        {voiceError && <p role="status" className="rounded-lg bg-muted p-2 text-sm">{voiceError}</p>}
        {mode === "live" && !voices.length && <p className="text-xs text-muted-foreground">صوت عربي مش متاح حاليًا على الجهاز. الرد هيظهر مكتوب.</p>}
        <form className="flex items-end gap-2" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(draft, mode === "live"); }}>
          <Textarea aria-label="الرسالة" value={draft} maxLength={1200} onChange={e => setDraft(e.target.value)} placeholder="اكتب رسالتك لسيفي" rows={2} />
          <Button type="submit" disabled={!shareText || busy || !draft.trim()}><Send />إرسال</Button>
        </form>
      </div>
    </section>
  </div>;
}
