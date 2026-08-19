// @vitest-environment jsdom
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArabicVoice } from "../client/src/hooks/useArabicVoice";

const speech = { getVoices: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), cancel: vi.fn(), speak: vi.fn() };

class FakeUtterance {
  lang = ""; rate = 0; pitch = 0; voice: SpeechSynthesisVoice | null = null;
  constructor(public text: string) {}
}

beforeEach(() => {
  speech.getVoices.mockReturnValue([
    { voiceURI: "egypt", name: "Arabic Egypt", lang: "ar-EG", default: true },
    { voiceURI: "saudi", name: "Arabic Saudi", lang: "ar-SA", default: false },
    { voiceURI: "english", name: "English", lang: "en-US", default: false },
  ]);
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: speech });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  window.localStorage.clear(); speech.cancel.mockClear(); speech.speak.mockClear();
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("Seify Arabic voice preference", () => {
  it("stores a chosen Arabic voice and uses it for playback", () => {
    const { result } = renderHook(() => useArabicVoice());
    act(() => result.current.chooseVoice("saudi"));
    expect(window.localStorage.getItem("seify-arabic-voice-uri")).toBe("saudi");
    let playback: { played: boolean } | undefined;
    act(() => { playback = result.current.speak("أهلا يا سيف"); });
    expect(playback).toEqual({ played: true, message: "" });
    const utterance = speech.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(utterance.voice?.voiceURI).toBe("saudi");
    expect(utterance.lang).toBe("ar-SA");
  });

  it("refuses playback when the device exposes no Arabic voice", () => {
    speech.getVoices.mockReturnValue([{ voiceURI: "english", name: "English", lang: "en-US", default: true }]);
    const { result } = renderHook(() => useArabicVoice());
    let playback: { played: boolean; message: string } | undefined;
    act(() => { playback = result.current.speak("أهلا يا سيف"); });
    expect(playback?.played).toBe(false);
    expect(playback?.message).toContain("مش هشغّل صوت أجنبي");
    expect(speech.speak).not.toHaveBeenCalled();
  });
});
