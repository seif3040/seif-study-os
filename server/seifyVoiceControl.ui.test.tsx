// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
import { SeifyVoiceControl } from "../client/src/components/SeifyVoiceControl";

afterEach(() => { cleanup(); mocks.toastError.mockClear(); delete (window as any).SpeechRecognition; delete (window as any).webkitSpeechRecognition; });

describe("mounted Seify voice control", () => {
  it("shows a fallback message when the browser lacks speech recognition", () => {
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Chrome"));
  });

  it("resets the visible listening state and shows recovery text when recognition errors", () => {
    let active: any;
    class FakeRecognition { lang = ""; interimResults = false; continuous = false; onstart: (() => void) | null = null; onerror: (() => void) | null = null; onend: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; start() { active = this; this.onstart?.(); } stop() {} }
    (window as any).SpeechRecognition = FakeRecognition;
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    expect(screen.getByText("سامعك… اتكلم براحتك")).toBeTruthy();
    act(() => active.onerror?.());
    expect(screen.getByText("اضغط واتكلم، وهو هيرد عليك بصوت")).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("اكتب طلبك"));
  });
});
