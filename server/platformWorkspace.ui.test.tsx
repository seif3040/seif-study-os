// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlatformLink, PlatformWorkspaceProvider, usePlatformWorkspace } from "../client/src/components/PlatformWorkspace";

const fixtures = vi.hoisted(() => ({
  mutate: vi.fn(),
  current: { id: 4, phase: "watching", timerRunning: false, activeSeconds: 0, lastPlaybackAt: null, completedBlocks: 0 },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: () => ({}), video: {
    current: { useQuery: () => ({ data: fixtures.current }) },
    setExternalTimer: { useMutation: () => ({ mutate: fixtures.mutate, isPending: false }) },
  } },
}));

function LaunchWithTimer({ url }: { url: string }) {
  const open = usePlatformWorkspace();
  return <button onClick={() => open?.({ url, timer: { subject: "history", sessionId: 4, start: true } })}>افتح وابدأ</button>;
}

beforeEach(() => vi.stubGlobal("React", React));

afterEach(() => {
  cleanup();
  fixtures.mutate.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens platform links inside the site without launching a browser window", () => {
  const popup = vi.spyOn(window, "open").mockReturnValue(null);
  render(<PlatformWorkspaceProvider>
    <PlatformLink title="منصة بسطتهالك" href="https://bassthalk.com/userprofile/home">افتح المنصة</PlatformLink>
  </PlatformWorkspaceProvider>);
  fireEvent.click(screen.getByText("افتح المنصة"));
  const frame = screen.getByTitle("منصة بسطتهالك");
  expect(frame.getAttribute("src")).toBe("https://bassthalk.com/userprofile/home");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  expect(popup).not.toHaveBeenCalled();
});

it("starts an embedded platform timer exactly once", async () => {
  render(<PlatformWorkspaceProvider><LaunchWithTimer url="https://student.sherbeniacademy.com/" /></PlatformWorkspaceProvider>);
  fireEvent.click(screen.getByText("افتح وابدأ"));
  await waitFor(() => expect(fixtures.mutate).toHaveBeenCalledTimes(1));
  expect(fixtures.mutate).toHaveBeenCalledWith({ sessionId: 4, running: true, elapsedMinutes: undefined });
});

it("opens a restricted platform in a pop-up before it starts the timer", async () => {
  const replace = vi.fn();
  const popup = vi.spyOn(window, "open").mockReturnValue({ closed: false, opener: window, location: { replace } } as unknown as Window);
  render(<PlatformWorkspaceProvider><LaunchWithTimer url="https://codingwithghonaim.com/" /></PlatformWorkspaceProvider>);
  fireEvent.click(screen.getByText("افتح وابدأ"));
  expect(screen.queryByTitle("codingwithghonaim.com")).toBeNull();
  expect(fixtures.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("افتح المنصة وابدأ المؤقت"));
  expect(popup).toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("https://codingwithghonaim.com/");
  await waitFor(() => expect(fixtures.mutate).toHaveBeenCalledTimes(1));
});
