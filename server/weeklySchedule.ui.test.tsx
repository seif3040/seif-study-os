// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/PageHeader", () => ({
  PageHeader: ({ title, description }: { title: string; description: string }) => <header><h1>{title}</h1><p>{description}</p></header>,
}));

import WeeklySchedule from "../client/src/pages/WeeklySchedule";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("weekly study schedule", () => {
  it("renders the planned sessions and records a completed session", () => {
    render(<WeeklySchedule />);

    expect(screen.getByText("جدول الأسبوع")).toBeTruthy();
    const firstSession = screen.getByRole("button", { name: /نص وتحليل/ });
    expect(firstSession.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(firstSession);

    expect(firstSession.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("الجلسات المنجزة").textContent).toContain("1 / 24");
  });
});
