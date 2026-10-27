/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueRun } from "./issue-run";
import { resetDemo } from "@/lib/store";

const TICK = 2600;

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  resetDemo();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("IssueRun", () => {
  it("lays out like the real issue page, with Live steer under the decisions strip", () => {
    render(<IssueRun number={1432} />);
    const main = screen.getByRole("region", { name: "Description" }).parentElement!;
    const sections = [...main.children].map((el) => el.getAttribute("aria-label") ?? el.querySelector("h2")?.textContent ?? "");
    expect(sections[0]).toBe("Description");
    expect(sections[1]).toBe("Agent decisions");
    expect(sections[2]).toContain("Live · Charles Xavier");
    expect(sections[3]).toContain("Conversation");

    const side = screen.getByRole("complementary", { name: "Issue details" });
    expect(within(side).getByText("Working", { selector: "dt" })).toBeTruthy();
    expect(within(side).getByRole("region", { name: "Activity" }).textContent).toContain("Charles Xavier claimed it for Stephen Okoro");
    // The remaining plan starts collapsed.
    expect(screen.getByText(/Remaining plan/).closest("details")?.open).toBe(false);
  });

  it("stops for a question and takes the answer", () => {
    render(<IssueRun number={1432} />);
    act(() => vi.advanceTimersByTime(TICK * 4)); // read, mistakes, plan, ask
    expect(screen.getByText("Charles Xavier is waiting on you")).toBeTruthy();
    expect(screen.getAllByText("Waiting on you")).toHaveLength(2); // the card and the Status box
    expect(screen.getByText("Clock stopped")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep the schema as it is" }));
    expect(screen.queryByText("Charles Xavier is waiting on you")).toBeNull();
    expect(document.querySelector(".run-next-title")?.textContent).toBe("Make the vote action idempotent with an upsert");
    const activity = screen.getByRole("region", { name: "Activity" });
    expect(activity.textContent).toContain("You answered: Keep the schema as it is");
    expect(activity.textContent).toContain("Got it. Changing course.");
  });

  it("is read-only for someone who can't steer", () => {
    render(<IssueRun number={1429} />);
    expect(screen.getByRole("button", { name: /Pause/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "As a teammate" }));
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Redirect/ })).toBeNull();
    expect(screen.getByText(/can steer this agent/).textContent).toContain("Only Stephen Okoro");
  });

  it("shows no Live steer card when no agent holds the issue", () => {
    render(<IssueRun number={1427} />);
    expect(screen.queryByText(/Live ·/)).toBeNull();
    expect(screen.getByText(/nothing to steer/)).toBeTruthy();
  });
});
