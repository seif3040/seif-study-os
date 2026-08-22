import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Mic, MicOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { prepareMicrophone, startVoiceRecognition, voiceRecognitionErrorMessage, voiceRecognitionUnavailableMessage, type SpeechRecognitionConstructor } from "@/lib/voice";

export function SeifyVoiceControl({ disabled, onTranscript }: { disabled?: boolean; onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false); const [preparing, setPreparing] = useState(false); const [recovery, setRecovery] = useState(""); const recognition = useRef<ReturnType<typeof startVoiceRecognition>>(null);
  useEffect(() => () => recognition.current?.stop(), []);
  const start = async () => {
    if (preparing) return;
    setRecovery(""); setPreparing(true);
    recognition.current?.stop();
    const microphone = await prepareMicrophone(window as unknown as { navigator?: { mediaDevices?: { getUserMedia?: (constraints: MediaStreamConstraints) => Promise<{ getTracks: () => { stop: () => void }[] }> } } });
    setPreparing(false);
    if (!microphone.allowed) { setListening(false); setRecovery(microphone.message); toast.error(microphone.message); return; }
    recognition.current = startVoiceRecognition(window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }, { onStart: () => setListening(true), onError: error => { const message = voiceRecognitionErrorMessage(error); setListening(false); setRecovery(message); toast.error(message); }, onEnd: () => setListening(false), onTranscript, onUnavailable: () => { const message = voiceRecognitionUnavailableMessage(); setRecovery(message); toast.error(message); } });
  };
  return <div className="mb-3 rounded-3xl border bg-gradient-to-l from-primary/10 via-background to-background p-4 text-center"><div className="text-right"><p className="font-bold">كلم سيفي</p><p className="text-xs text-muted-foreground">{listening ? "سامعك… اتكلم براحتك" : preparing ? "بجهّز الميكروفون…" : disabled ? "بفكر معاك…" : "اضغط واتكلم، وسيفي هيكتب طلبك"}</p></div><button type="button" onClick={listening ? () => recognition.current?.stop() : start} disabled={disabled || preparing} className={cn("mx-auto mt-4 flex size-20 items-center justify-center rounded-full border-8 border-background text-primary-foreground shadow-lg transition active:scale-95", listening ? "bg-destructive shadow-destructive/30" : "bg-primary shadow-primary/30")} aria-label={listening ? "إيقاف الاستماع" : "ابدأ الكلام مع سيفي"}>{listening ? <MicOff className="size-8" /> : <Mic className="size-8" />}</button><p className="mt-2 text-xs font-medium">{listening ? "دوس عشان توقف" : "دوس وقول طلبك"}</p>{recovery && <div role="status" className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-50 p-3 text-right text-xs leading-5 text-amber-950"><AlertCircle className="ml-1 inline size-4" />{recovery}<Button size="sm" variant="ghost" className="mr-2 h-7 text-amber-950" onClick={start}><RotateCcw />جرّب تاني</Button></div>}</div>;
}
