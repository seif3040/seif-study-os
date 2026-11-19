// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import ExtensionStudySync from "../client/src/components/ExtensionStudySync";

const api = vi.hoisted(() => {
  let session: any;
  const updatePosition = vi.fn(async (input: { playbackPosition: number }) => ({
    session: { ...session, lastPlaybackPosition: Math.floor(input.playbackPosition) },
    blockCompleted: false,
  }));
  const start = vi.fn(async (input: object) => {
    session = { ...input, id: 12, sourceMode: "external", phase: "watching", timerRunning: false };
    return session;
  });
  const extensionEndToken = vi.fn(async () => "test-end-grant");
  const sources = [{ active: true, delivery: "online", subject: "التاريخ", teacherName: "أحمد غنيم", url: "https://sherbeniacademy.com/" }];
  const utils = {
    client: { video: { start: { mutate: start }, current: { query: async () => session }, extensionPlayback: { mutate: updatePosition }, extensionEndToken: { mutate: extensionEndToken } } },
    video: { current: { setData: vi.fn(), getData: () => session }, open: { setData: vi.fn() } },
  };
  return { sources, start, updatePosition, extensionEndToken, utils };
});

vi.mock("@/lib/trpc", () => ({
  trpc: { lessonSources: { list: { useQuery: () => ({ data: api.sources }) } }, useUtils: () => api.utils },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("opens one history session and takes the latest seek and pause while a request is in flight", async () => {
  const posted = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  render(<ExtensionStudySync />);
  const subscription = posted.mock.calls.find(([message]) => message.type === "seif-study-extension:subscribe")?.[0];
  expect(subscription).toBeTruthy();
  const time = Date.now();
  const url = "https://student.sherbeniacademy.com/lms-learn/test";
  const send = (position: number, playing: boolean, offset: number) => window.dispatchEvent(new MessageEvent("message", {
    source: window,
    origin: window.location.origin,
    data: {
      type: "seif-study-extension:activities", id: subscription.id,
      data: [{ url, title: "صفحة الكورس", detectedTitle: "الحملة الفرنسية", position, playing, lastAutoAt: time, lastPlayingAt: time, updatedAt: time + offset }],
    },
  }));

  let finishFirst!: () => void;
  api.updatePosition.mockImplementationOnce(() => new Promise(resolve => {
    finishFirst = () => resolve({ session: { id: 12, subject: "history", phase: "watching" }, blockCompleted: false });
  }));
  send(0, true, 0);
  await waitFor(() => expect(api.updatePosition).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 12, active: true, playbackPosition: 0 })));
  send(20, true, 1);
  send(125, false, 2);
  finishFirst();
  await waitFor(() => expect(api.updatePosition).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 12, active: false, playbackPosition: 125 })));
  expect(api.start).toHaveBeenCalledTimes(1);
  expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ subject: "history", videoUrl: url, lessonTitle: "الحملة الفرنسية" }));
  expect(posted.mock.calls).toContainEqual([expect.objectContaining({
    type: "seif-study-extension:status", status: expect.objectContaining({ state: "paused", subjectKey: "history", sessionId: 12, endToken: "test-end-grant" }),
  }), window.location.origin]);
});
