export type SpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognitionConstructor(runtime: { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }) {
  return runtime.SpeechRecognition ?? runtime.webkitSpeechRecognition ?? null;
}

export function voiceRecognitionUnavailableMessage() {
  return "المتصفح ده مش بيدعم الكلام للكتابة. جرّب Chrome أو اكتب طلبك.";
}

export function voiceRecognitionFailedMessage() {
  return "ماسمعتكش كويس. جرّب تاني أو اكتب طلبك.";
}

export function startVoiceRecognition(runtime: { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }, handlers: { onStart: () => void; onError: () => void; onEnd: () => void; onTranscript: (text: string) => void; onUnavailable: () => void }) {
  const Recognition = getSpeechRecognitionConstructor(runtime);
  if (!Recognition) { handlers.onUnavailable(); return null; }
  const instance = new Recognition();
  instance.lang = "ar-EG"; instance.interimResults = false; instance.continuous = false;
  instance.onstart = handlers.onStart; instance.onerror = handlers.onError; instance.onend = handlers.onEnd;
  instance.onresult = (event: any) => { const text = event?.results?.[0]?.[0]?.transcript?.trim(); if (text) handlers.onTranscript(text); };
  instance.start(); return instance;
}
