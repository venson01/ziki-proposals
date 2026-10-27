/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssuesList } from "./issues-list";
import { AppShell } from "./app-shell";
import { resetDemo } from "@/lib/store";

vi.mock("next/navigation", () => ({ usePathname: () => "/issues" }));

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  resetDemo();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function rowFor(title: string) {
  return screen.getByText(title).closest("li")!;
}

describe("IssuesList", () => {
  it("celebrates a resolve, then folds the row out of the Open tab", () => {
    render(<AppShell><IssuesList /></AppShell>);
    const title = "Search snippet cuts a word in half at the ellipsis";
    const row = rowFor(title);
    fireEvent.change(within(row).getByLabelText(/Status for #1413/), { target: { value: "resolved" } });

    expect(rowFor(title).dataset.celebrating).toBe("flying");
    expect(screen.getByRole("status").textContent).toContain("#1413 resolved by You.");

    act(() => vi.advanceTimersByTime(2000));
    expect(rowFor(title).dataset.celebrating).toBe("leaving");
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText(title)).toBeNull();
  });

  it("keeps the row on the All tab after it settles", () => {
    render(<IssuesList />);
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    const title = "Search snippet cuts a word in half at the ellipsis";
    fireEvent.change(within(rowFor(title)).getByLabelText(/Status for #1413/), { target: { value: "resolved" } });
    act(() => vi.advanceTimersByTime(2000));
    expect(rowFor(title).dataset.celebrating).toBeUndefined();
    act(() => vi.advanceTimersByTime(400));
    expect(rowFor(title).dataset.done).toBe("true");
  });

  it("undoes a resolve from the toast", () => {
    render(<AppShell><IssuesList /></AppShell>);
    const title = "Search snippet cuts a word in half at the ellipsis";
    fireEvent.change(within(rowFor(title)).getByLabelText(/Status for #1413/), { target: { value: "resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect((within(rowFor(title)).getByLabelText(/Status for #1413/) as HTMLSelectElement).value).toBe("open");
    expect(rowFor(title).dataset.celebrating).toBeUndefined();
  });

  it("doesn't celebrate closing", () => {
    render(<AppShell><IssuesList /></AppShell>);
    const title = "Search snippet cuts a word in half at the ellipsis";
    fireEvent.change(within(rowFor(title)).getByLabelText(/Status for #1413/), { target: { value: "closed" } });
    expect(screen.queryByText(title)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("lets an agent resolve an issue it's working on", () => {
    render(<AppShell><IssuesList /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "In progress 3" }));
    fireEvent.click(screen.getByRole("button", { name: /Let an agent resolve one/ }));
    expect(screen.getByRole("status").textContent).toContain("#1432 resolved by Charles Xavier.");
  });
});
