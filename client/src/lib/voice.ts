export type SpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

export type ArabicVoice = Pick<SpeechSynthesisVoice, "voiceURI" | "name" | "lang" | "default">;
const ARABIC_PRIORITY = ["ar-eg", "ar-sa", "ar-ae", "ar-kw", "ar-qa", "ar-ma", "ar"];

export function getSpeechRecognitionConstructor(runtime: { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }) {
  return runtime.SpeechRecognition ?? runtime.webkitSpeechRecognition ?? null;
}

export function voiceRecognitionUnavailableMessage() { return "المتصفح ده مش بيدعم الكلام للكتابة. جرّب Chrome أو اكتب طلبك."; }
export function voiceRecognitionFailedMessage() { return "ماسمعتكش كويس. جرّب تاني أو اكتب طلبك."; }
export function voiceRecognitionErrorMessage(error?: string) {
  if (["not-allowed", "service-not-allowed"].includes(error ?? "")) return "المتصفح مانع الميكروفون. اضغط علامة القفل جنب عنوان الموقع، واختر السماح للميكروفون، ثم جرّب تاني.";
  if (["audio-capture", "not-found"].includes(error ?? "")) return "مش لاقي ميكروفون شغّال. وصّل أو فعّل مايك اللابتوب من إعدادات الصوت، ثم جرّب تاني.";
  if (error === "network") return "في مشكلة اتصال أثناء تشغيل الكلام. اتأكد من الإنترنت ثم جرّب تاني.";
  if (error === "no-speech") return "ماسمعتكش كويس. قرّب من الميكروفون واتكلم بعد ما الزرار يبقى أحمر.";
  return voiceRecognitionFailedMessage();
}
export function microphoneAccessErrorMessage(error?: { name?: string } | null) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name ?? "")) return voiceRecognitionErrorMessage("not-allowed");
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(error?.name ?? "")) return voiceRecognitionErrorMessage("audio-capture");
  return "مش قادر أجهز الميكروفون دلوقتي. اتأكد إنه مش مستخدم في برنامج تاني وجرّب تاني.";
}

type MicrophoneRuntime = { navigator?: { mediaDevices?: { getUserMedia?: (constraints: MediaStreamConstraints) => Promise<{ getTracks: () => { stop: () => void }[] }> } } };
export async function prepareMicrophone(runtime: MicrophoneRuntime) {
  const getUserMedia = runtime.navigator?.mediaDevices?.getUserMedia;
  if (!getUserMedia) return { allowed: true as const };
  try { const stream = await getUserMedia({ audio: true }); stream.getTracks().forEach(track => track.stop()); return { allowed: true as const }; }
  catch (error) { return { allowed: false as const, message: microphoneAccessErrorMessage(error as { name?: string }) }; }
}
export function arabicVoiceUnavailableMessage() { return "مش لاقي صوت عربي على الجهاز، فمش هشغّل صوت أجنبي. فعّل أو نزّل صوت عربي من إعدادات الجهاز أو المتصفح."; }

export function listArabicVoices(voices: ArabicVoice[]) {
  return voices.filter(voice => /^ar(?:[-_]|$)/i.test(voice.lang));
}

export function selectArabicVoice(voices: ArabicVoice[], selectedVoiceURI?: string | null) {
  const arabic = listArabicVoices(voices);
  if (!arabic.length) return null;
  const explicitlySelected = selectedVoiceURI ? arabic.find(voice => voice.voiceURI === selectedVoiceURI) : undefined;
  if (explicitlySelected) return explicitlySelected;
  return [...arabic].sort((a, b) => {
    const aRank = ARABIC_PRIORITY.indexOf(a.lang.toLowerCase().replace("_", "-"));
    const bRank = ARABIC_PRIORITY.indexOf(b.lang.toLowerCase().replace("_", "-"));
    return (aRank < 0 ? ARABIC_PRIORITY.length : aRank) - (bRank < 0 ? ARABIC_PRIORITY.length : bRank) || Number(b.default) - Number(a.default);
  })[0];
}

export function speakArabicText(runtime: Pick<SpeechSynthesis, "cancel" | "speak">, text: string, voices: ArabicVoice[], selectedVoiceURI?: string | null) {
  const voice = selectArabicVoice(voices, selectedVoiceURI);
  if (!voice) return false;
  runtime.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/[«»*_#]/g, " "));
  utterance.lang = voice.lang; utterance.rate = 1; utterance.pitch = 1; utterance.voice = voice as SpeechSynthesisVoice;
  runtime.speak(utterance); return true;
}

export function startVoiceRecognition(runtime: { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }, handlers: { onStart: () => void; onError: (error?: string) => void; onEnd: () => void; onTranscript: (text: string) => void; onUnavailable: () => void }) {
  const Recognition = getSpeechRecognitionConstructor(runtime);
  if (!Recognition) { handlers.onUnavailable(); return null; }
  const instance = new Recognition();
  instance.lang = "ar-EG"; instance.interimResults = false; instance.continuous = false;
  instance.onstart = handlers.onStart; instance.onerror = event => handlers.onError(event?.error); instance.onend = handlers.onEnd;
  instance.onresult = (event: any) => { const text = event?.results?.[0]?.[0]?.transcript?.trim(); if (text) handlers.onTranscript(text); };
  try { instance.start(); return instance; } catch { handlers.onError("start-failed"); return null; }
}
