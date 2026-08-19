import { useCallback, useEffect, useState } from "react";
import { arabicVoiceUnavailableMessage, listArabicVoices, speakArabicText, type ArabicVoice } from "@/lib/voice";

const STORAGE_KEY = "seify-arabic-voice-uri";

export function useArabicVoice() {
  const [voices, setVoices] = useState<ArabicVoice[]>([]); const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(listArabicVoices(window.speechSynthesis.getVoices()));
    try { setSelectedVoiceURI(window.localStorage.getItem(STORAGE_KEY)); } catch { /* storage can be unavailable */ }
    update(); window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  const chooseVoice = useCallback((voiceURI: string) => { setSelectedVoiceURI(voiceURI); try { window.localStorage.setItem(STORAGE_KEY, voiceURI); } catch { /* storage can be unavailable */ } }, []);
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return { played: false, message: arabicVoiceUnavailableMessage() };
    const played = speakArabicText(window.speechSynthesis, text, voices, selectedVoiceURI);
    return { played, message: played ? "" : arabicVoiceUnavailableMessage() };
  }, [voices, selectedVoiceURI]);
  return { voices, selectedVoiceURI, chooseVoice, speak };
}
