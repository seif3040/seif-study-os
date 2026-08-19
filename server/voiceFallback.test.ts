import { describe, expect, it, vi } from "vitest";
import { getSpeechRecognitionConstructor, startVoiceRecognition, voiceRecognitionFailedMessage, voiceRecognitionUnavailableMessage, type SpeechRecognitionConstructor } from "../client/src/lib/voice";

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
    active.onerror?.(); active.onend?.();
    expect(errorFlow.onStart).toHaveBeenCalledOnce();
    expect(errorFlow.onError).toHaveBeenCalledOnce();
    expect(errorFlow.onEnd).toHaveBeenCalledOnce();
    expect(errorFlow.onUnavailable).not.toHaveBeenCalled();
  });
});
