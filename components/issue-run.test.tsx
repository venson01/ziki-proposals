/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueRun } from "./issue-run";
import { AppShell } from "./app-shell";
import { changeStatus, resetDemo } from "@/lib/store";
import { launchBug } from "@/lib/bug-flight";

vi.mock("next/navigation", () => ({ usePathname: () => "/issues/1409" }));
vi.mock("@/lib/bug-flight", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bug-flight")>()),
  launchBug: vi.fn(() => Promise.resolve()),
}));

const TICK = 2600;

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  resetDemo();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(launchBug).mockClear();
});

describe("opening a resolved issue", () => {
  const header = () => document.querySelector<HTMLElement>('section[aria-label="Status"]')!;
  beforeEach(() => {
    // jsdom lays nothing out; give the bug icon a size so it can take off.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 20, top: 100, width: 48, height: 48 } as DOMRect);
  });

  it("sets the bug free again, without a toast", () => {
    render(<AppShell><IssueRun number={1409} /></AppShell>);
    expect(header().dataset.celebrating).toBeUndefined();
    act(() => vi.advanceTimersByTime(350));
    expect(header().dataset.celebrating).toBe("flying");
    expect(launchBug).toHaveBeenCalledTimes(1);
    expect(vi.mocked(launchBug).mock.calls[0][1]).toMatchObject({ seed: 1409 });
    expect(document.querySelector(".zk-toast-region")?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(2000));
    expect(header().dataset.celebrating).toBeUndefined();
  });

  it("plays for an issue resolved earlier, as after a reload", () => {
    changeStatus(1413, "resolved");
    act(() => vi.advanceTimersByTime(3000));
    vi.mocked(launchBug).mockClear();
    render(<IssueRun number={1413} />);
    act(() => vi.advanceTimersByTime(350));
    expect(launchBug).toHaveBeenCalledTimes(1);
  });

  it("doesn't play for open or closed issues", () => {
    render(<IssueRun number={1427} />);
    cleanup();
    render(<IssueRun number={1402} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(launchBug).not.toHaveBeenCalled();
    expect(header().dataset.celebrating).toBeUndefined();
  });

  it("stays still with reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<IssueRun number={1409} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(launchBug).not.toHaveBeenCalled();
    expect(header().dataset.celebrating).toBeUndefined();
  });

  it("is cancelled when the page closes before take-off", () => {
    const { unmount } = render(<IssueRun number={1409} />);
    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(launchBug).not.toHaveBeenCalled();
  });
});

describe("IssueRun", () => {
  it("lays out like the real issue page, with Live steer under the decisions strip", () => {
    render(<IssueRun number={1432} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("#1432 Vote button double-counts when clicked twice quickly");
    expect(screen.getByRole("button", { name: "Upvote 14 votes" })).toBeTruthy();
    const main = screen.getByRole("region", { name: "Description" }).parentElement!;
    const sections = [...main.children].map((el) => el.getAttribute("aria-label") ?? el.querySelector("h2")?.textContent ?? "");
    expect(sections).toEqual([
      "Description",
      "Agent decisions",
      expect.stringContaining("Live · Charles Xavier"),
      "Update status",
      "Merge decisions 0",
      expect.stringContaining("Conversation"),
    ]);

    const side = screen.getByRole("complementary", { name: "Issue details" });
    const cards = [...side.children].map((el) => el.getAttribute("aria-label"));
    expect(cards).toEqual(["Status", "People", "GitHub PR", "Activity"]);
    const status = within(side).getByRole("region", { name: "Status" });
    expect(status.textContent).toContain("In progress");
    expect(status.textContent).toContain("High");
    expect(status.textContent).toContain("Ready");
    expect(status.textContent).toContain("Opened 4h ago by Ada Nwosu");
    const people = within(side).getByRole("region", { name: "People" });
    expect(people.textContent).toContain("ReporterANAda NwosuCreator");
    expect(people.textContent).toContain("Working");
    // Activity is collapsed, like the real ActivityTimeline, and already lists the claim.
    const activity = within(side).getByRole("region", { name: "Activity" });
    expect(activity.querySelector("details")?.open).toBe(false);
    expect(activity.textContent).toContain("Charles Xavier claimed this issue for Stephen Okoro");
    // The remaining plan starts collapsed.
    expect(screen.getByText(/Remaining plan/).closest("details")?.open).toBe(false);
  });

  it("toggles the upvote", () => {
    render(<IssueRun number={1432} />);
    fireEvent.click(screen.getByRole("button", { name: "Upvote 14 votes" }));
    expect(screen.getByRole("button", { name: "Upvoted 15 votes" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("resolves from Update status, and the bug takes off from the Status chip", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 700, top: 200, bottom: 230, width: 80, height: 30 } as DOMRect);
    render(<IssueRun number={1427} />);
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "resolved" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(save);
    expect(screen.getByText(/^Saved\./)).toBeTruthy();
    expect(launchBug).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Resolution note" }).textContent).toContain("Resolved by You");
    const statusChip = document.querySelector<HTMLElement>('[data-bug-priority="0"]')!;
    expect(statusChip.textContent).toBe("Resolved");
  });

  it("shows who resolved it, and Reopen puts it back", () => {
    render(<IssueRun number={1409} />);
    expect(screen.getByRole("region", { name: "Resolution note" }).textContent).toContain("Resolved by Charles Xavier");
    expect(screen.getByText(/because/).textContent).toBe("Resolved by Charles Xavier because its pull request was merged.");
    expect(screen.getByRole("region", { name: "GitHub PR" }).textContent).toContain("github.com/Zedu-Endor/issue-tracker/pull/1417");
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.queryByRole("region", { name: "Resolution note" })).toBeNull();
    expect(screen.getByRole("region", { name: "Status" }).textContent).toContain("Open");
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
    expect(screen.queryByText("Recent steps")).toBeNull();
    expect(screen.getByRole("region", { name: "People" }).textContent).not.toContain("Working");
  });
});
