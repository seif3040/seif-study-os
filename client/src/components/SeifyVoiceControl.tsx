import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startVoiceRecognition, voiceRecognitionFailedMessage, voiceRecognitionUnavailableMessage, type SpeechRecognitionConstructor } from "@/lib/voice";

export function SeifyVoiceControl({ disabled, onTranscript }: { disabled?: boolean; onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false); const recognition = useRef<ReturnType<typeof startVoiceRecognition>>(null);
  useEffect(() => () => recognition.current?.stop(), []);
  const start = () => {
    recognition.current?.stop();
    recognition.current = startVoiceRecognition(window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }, { onStart: () => setListening(true), onError: () => { setListening(false); toast.error(voiceRecognitionFailedMessage()); }, onEnd: () => setListening(false), onTranscript, onUnavailable: () => toast.error(voiceRecognitionUnavailableMessage()) });
  };
  return <div className="mb-3 rounded-3xl border bg-gradient-to-l from-primary/10 via-background to-background p-4 text-center"><div className="text-right"><p className="font-bold">كلم سيفي</p><p className="text-xs text-muted-foreground">{listening ? "سامعك… اتكلم براحتك" : disabled ? "بفكر معاك…" : "اضغط واتكلم، وهو هيرد عليك بصوت"}</p></div><button type="button" onClick={listening ? () => recognition.current?.stop() : start} disabled={disabled} className={cn("mx-auto mt-4 flex size-20 items-center justify-center rounded-full border-8 border-background text-primary-foreground shadow-lg transition active:scale-95", listening ? "bg-destructive shadow-destructive/30" : "bg-primary shadow-primary/30")} aria-label={listening ? "إيقاف الاستماع" : "ابدأ الكلام مع سيفي"}>{listening ? <MicOff className="size-8" /> : <Mic className="size-8" />}</button><p className="mt-2 text-xs font-medium">{listening ? "دوس عشان توقف" : "دوس وقول طلبك"}</p></div>;
}
