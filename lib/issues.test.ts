import { describe, expect, it } from "vitest";
import { SEED_ISSUES, formatAge, inTab, resolveQuip, setStatus, tabCounts, RESOLVE_QUIPS } from "./issues";

describe("setStatus", () => {
  it("celebrates going to resolved", () => {
    const result = setStatus(SEED_ISSUES, 1432, "resolved");
    expect(result.celebrate).toBe(true);
    expect(result.issues.find((i) => i.number === 1432)?.status).toBe("resolved");
    expect(result.issues.find((i) => i.number === 1432)?.updatedMinsAgo).toBe(0);
  });

  it("doesn't celebrate closing, reopening or other changes", () => {
    expect(setStatus(SEED_ISSUES, 1432, "closed").celebrate).toBe(false);
    expect(setStatus(SEED_ISSUES, 1409, "open").celebrate).toBe(false);
    expect(setStatus(SEED_ISSUES, 1427, "in_progress").celebrate).toBe(false);
  });

  it("is a no-op when the status doesn't change or the issue is unknown", () => {
    const same = setStatus(SEED_ISSUES, 1409, "resolved");
    expect(same.celebrate).toBe(false);
    expect(same.issues).toBe(SEED_ISSUES);
    expect(setStatus(SEED_ISSUES, 9999, "resolved").issues).toBe(SEED_ISSUES);
  });

  it("doesn't mutate the input", () => {
    const before = JSON.stringify(SEED_ISSUES);
    setStatus(SEED_ISSUES, 1432, "resolved");
    expect(JSON.stringify(SEED_ISSUES)).toBe(before);
  });
});

describe("tabs", () => {
  it("puts resolved and closed under Done", () => {
    expect(inTab({ status: "resolved" }, "done")).toBe(true);
    expect(inTab({ status: "closed" }, "done")).toBe(true);
    expect(inTab({ status: "resolved" }, "open")).toBe(false);
    expect(inTab({ status: "open" }, "all")).toBe(true);
  });

  it("counts every issue once outside All", () => {
    const counts = tabCounts(SEED_ISSUES);
    expect(counts.open + counts.in_progress + counts.done).toBe(counts.all);
    expect(counts.all).toBe(SEED_ISSUES.length);
  });
});

describe("formatAge", () => {
  it.each([
    [0, "just now"],
    [12, "12m ago"],
    [60, "1h ago"],
    [1500, "1d ago"],
  ])("%d minutes → %s", (minutes, text) => {
    expect(formatAge(minutes)).toBe(text);
  });
});

it("picks a quip for any issue number", () => {
  expect(RESOLVE_QUIPS).toContain(resolveQuip(1432));
  expect(RESOLVE_QUIPS).toContain(resolveQuip(0));
});
