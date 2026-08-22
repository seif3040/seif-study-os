// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
import { SeifyVoiceControl } from "../client/src/components/SeifyVoiceControl";

afterEach(() => { cleanup(); mocks.toastError.mockClear(); delete (window as any).SpeechRecognition; delete (window as any).webkitSpeechRecognition; delete (navigator as any).mediaDevices; });

describe("mounted Seify voice control", () => {
  it("shows a fallback message when the browser lacks speech recognition", async () => {
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Chrome"));
  });

  it("resets the visible listening state and shows recovery text when recognition errors", async () => {
    let active: any;
    class FakeRecognition { lang = ""; interimResults = false; continuous = false; onstart: (() => void) | null = null; onerror: (() => void) | null = null; onend: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; start() { active = this; this.onstart?.(); } stop() {} }
    (window as any).SpeechRecognition = FakeRecognition;
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    await waitFor(() => expect(screen.getByText("سامعك… اتكلم براحتك")).toBeTruthy());
    act(() => active.onerror?.({ error: "no-speech" }));
    expect(screen.getByText("اضغط واتكلم، وسيفي هيكتب طلبك")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("قرّب");
  });

  it("shows laptop permission recovery and a retry control when microphone access is denied", async () => {
    (navigator as any).mediaDevices = { getUserMedia: vi.fn().mockRejectedValue({ name: "NotAllowedError" }) };
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    expect(await screen.findByText(/علامة القفل/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /جرّب تاني/ })).toBeTruthy();
  });

  it("keeps one visible recovery message while still trying browser recognition after a transient capture failure", async () => {
    let active: any;
    class FakeRecognition { lang = ""; interimResults = false; continuous = false; onstart: (() => void) | null = null; onerror: (() => void) | null = null; onend: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; start() { active = this; this.onstart?.(); } stop() {} }
    (window as any).SpeechRecognition = FakeRecognition;
    (navigator as any).mediaDevices = { getUserMedia: vi.fn().mockRejectedValue({ name: "NotReadableError" }) };
    render(<SeifyVoiceControl onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الكلام مع سيفي" }));
    await waitFor(() => expect(screen.getByText("سامعك… اتكلم براحتك")).toBeTruthy());
    expect(active).toBeTruthy(); expect(screen.queryByRole("status")).toBeNull(); expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
