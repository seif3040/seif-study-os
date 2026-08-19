import { describe, expect, it } from "vitest";
import { getSpeechRecognitionConstructor, voiceRecognitionFailedMessage, voiceRecognitionUnavailableMessage } from "./voice";

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
});
