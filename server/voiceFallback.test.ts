import { describe, expect, it, vi } from "vitest";
import { arabicVoiceUnavailableMessage, getSpeechRecognitionConstructor, microphoneAccessErrorMessage, prepareMicrophone, selectArabicVoice, startVoiceRecognition, voiceRecognitionErrorMessage, voiceRecognitionFailedMessage, voiceRecognitionUnavailableMessage, type SpeechRecognitionConstructor } from "../client/src/lib/voice";

describe("Seify voice fallback", () => {
  it("returns no constructor when browser speech recognition is unavailable", () => {
    expect(getSpeechRecognitionConstructor({})).toBeNull();
    expect(voiceRecognitionUnavailableMessage()).toContain("Chrome");
  });

  it("uses the webkit browser fallback and exposes a recovery message", () => {
    const constructor = class {} as unknown as Parameters<typeof getSpeechRecognitionConstructor>[0]["webkitSpeechRecognition"];
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: constructor })).toBe(constructor);
    expect(voiceRecognitionFailedMessage()).toContain("اكتب طلبك");
  });

  it("prefers an Egyptian Arabic voice and refuses a non-Arabic fallback", () => {
    const voices = [
      { voiceURI: "english", name: "English", lang: "en-US", default: true },
      { voiceURI: "saudi", name: "Arabic Saudi", lang: "ar-SA", default: false },
      { voiceURI: "egyptian", name: "Arabic Egypt", lang: "ar-EG", default: false },
    ];
    expect(selectArabicVoice(voices)?.voiceURI).toBe("egyptian");
    expect(selectArabicVoice(voices, "saudi")?.voiceURI).toBe("saudi");
    expect(selectArabicVoice([{ voiceURI: "english", name: "English", lang: "en-US", default: true }])).toBeNull();
    expect(arabicVoiceUnavailableMessage()).toContain("مش هشغّل صوت أجنبي");
  });

  it("drives the mounted assistant fallback callbacks when recognition is unavailable or errors", () => {
    const unavailable = { onStart: vi.fn(), onError: vi.fn(), onEnd: vi.fn(), onTranscript: vi.fn(), onUnavailable: vi.fn() };
    expect(startVoiceRecognition({}, unavailable)).toBeNull();
    expect(unavailable.onUnavailable).toHaveBeenCalledOnce();

    let active: any;
    class FakeRecognition {
      lang = ""; interimResults = false; continuous = false; onstart: (() => void) | null = null; onerror: (() => void) | null = null; onend: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null;
      start() { active = this; this.onstart?.(); }
      stop() {}
    }
    const errorFlow = { onStart: vi.fn(), onError: vi.fn(), onEnd: vi.fn(), onTranscript: vi.fn(), onUnavailable: vi.fn() };
    startVoiceRecognition({ SpeechRecognition: FakeRecognition as unknown as SpeechRecognitionConstructor }, errorFlow);
    active.onerror?.({ error: "not-allowed" }); active.onend?.();
    expect(errorFlow.onStart).toHaveBeenCalledOnce();
    expect(errorFlow.onError).toHaveBeenCalledWith("not-allowed");
    expect(errorFlow.onEnd).toHaveBeenCalledOnce();
    expect(errorFlow.onUnavailable).not.toHaveBeenCalled();
  });

  it("explains laptop microphone permissions and missing-device failures before recognition starts", async () => {
    expect(voiceRecognitionErrorMessage("not-allowed")).toContain("علامة القفل");
    expect(voiceRecognitionErrorMessage("audio-capture")).toContain("ميكروفون");
    expect(microphoneAccessErrorMessage({ name: "NotFoundError" })).toContain("مش لاقي");
    const denied = await prepareMicrophone({ navigator: { mediaDevices: { getUserMedia: async () => { throw { name: "NotAllowedError" }; } } } });
    expect(denied).toMatchObject({ allowed: false, message: expect.stringContaining("علامة القفل") });
    const stopped = vi.fn(); const allowed = await prepareMicrophone({ navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopped }] }) } } });
    expect(allowed).toMatchObject({ allowed: true }); expect(stopped).toHaveBeenCalledOnce();
  });

  it("does not block browser-native recognition after a transient microphone capture failure", async () => {
    const transient = await prepareMicrophone({ navigator: { mediaDevices: { getUserMedia: async () => { throw { name: "NotReadableError" }; } } } });
    expect(transient).toMatchObject({ allowed: true, warning: expect.stringContaining("مش قادر أجهز") });
  });
});
