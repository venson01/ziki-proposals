import { describe, expect, it } from "vitest";
import {
  describeRedirect,
  formatClock,
  nextCheckpoint,
  planFor,
  revisePlan,
  runReducer,
  startRun,
  type PlannedStep,
  type RunAction,
  type RunState,
} from "./agent-run";

const PLAN: PlannedStep[] = [
  { kind: "read", title: "Read" },
  { kind: "plan", title: "Plan", checkpoint: true },
  { kind: "edit", title: "Schema", checkpoint: true, schema: true, alt: { kind: "edit", title: "Upsert", checkpoint: true } },
  { kind: "edit", title: "Polish", optional: true },
  { kind: "test", title: "Test", checkpoint: true },
  { kind: "resolve", title: "Resolve" },
];

function run(state: RunState, ...actions: RunAction[]): RunState {
  return actions.reduce(runReducer, state);
}
const tick: RunAction = { type: "tick", at: 0 };

describe("runReducer", () => {
  it("works through the plan and finishes on resolve", () => {
    let state = startRun(PLAN);
    for (let i = 0; i < PLAN.length; i++) state = runReducer(state, tick);
    expect(state.phase).toBe("done");
    expect(state.events.map((e) => e.title)).toEqual(PLAN.map((s) => s.title));
    expect(runReducer(state, tick)).toBe(state);
  });

  it("pauses only at the next checkpoint", () => {
    let state = run(startRun(PLAN), { type: "pause", at: 0 });
    expect(state.phase).toBe("pausing");
    state = runReducer(state, tick); // "Read" isn't a checkpoint
    expect(state.phase).toBe("pausing");
    state = runReducer(state, tick); // "Plan" is
    expect(state.phase).toBe("paused");
    expect(state.events.at(-1)?.kind).toBe("paused");
    // Paused: ticks do nothing.
    expect(runReducer(state, tick)).toBe(state);
    state = runReducer(state, { type: "resume", at: 0 });
    expect(state.phase).toBe("working");
    expect(state.events.at(-1)?.actor).toBe("human");
  });

  it("ignores pause unless working, and resume unless paused or pausing", () => {
    const working = startRun(PLAN);
    expect(runReducer(working, { type: "resume", at: 0 })).toBe(working);
    const pausing = runReducer(working, { type: "pause", at: 0 });
    expect(runReducer(pausing, { type: "pause", at: 0 })).toBe(pausing);
    expect(runReducer(pausing, { type: "resume", at: 0 }).phase).toBe("working");
  });

  it("queues a redirect until the next checkpoint, then acknowledges it", () => {
    let state = run(startRun(PLAN), { type: "redirect", at: 0, redirect: { preset: "no_schema", note: "" } });
    expect(state.pendingRedirect).not.toBeNull();
    expect(state.queue.some((s) => s.schema)).toBe(true);
    state = run(state, tick, tick); // Read, then Plan (checkpoint)
    expect(state.pendingRedirect).toBeNull();
    expect(state.events.at(-1)?.kind).toBe("ack");
    expect(state.queue.some((s) => s.schema)).toBe(false);
    expect(state.queue[0].title).toBe("Upsert");
    expect(state.applied).toHaveLength(1);
  });

  it("applies a redirect right away while paused, and stays paused", () => {
    let state = run(startRun(PLAN), { type: "pause", at: 0 }, tick, tick);
    expect(state.phase).toBe("paused");
    state = runReducer(state, { type: "redirect", at: 0, redirect: { preset: "smaller_scope", note: "" } });
    expect(state.phase).toBe("paused");
    expect(state.events.at(-1)?.kind).toBe("ack");
    expect(state.queue.some((s) => s.optional)).toBe(false);
  });

  it("ignores empty redirects and redirects after the run is done", () => {
    const state = startRun(PLAN);
    expect(runReducer(state, { type: "redirect", at: 0, redirect: { preset: null, note: "   " } })).toBe(state);
    let done = state;
    for (let i = 0; i < PLAN.length; i++) done = runReducer(done, tick);
    expect(runReducer(done, { type: "redirect", at: 0, redirect: { preset: "tests_first", note: "" } })).toBe(done);
  });

  it("drops a pending redirect when the run resolves", () => {
    const short: PlannedStep[] = [{ kind: "resolve", title: "Resolve" }];
    const state = run(startRun(short), { type: "redirect", at: 0, redirect: { preset: "tests_first", note: "" } }, tick);
    expect(state.phase).toBe("done");
    expect(state.pendingRedirect).toBeNull();
  });
});

describe("revisePlan", () => {
  it("adds a failing test first", () => {
    const { queue } = revisePlan(PLAN, { preset: "tests_first", note: "" });
    expect(queue[0].kind).toBe("test");
    expect(queue).toHaveLength(PLAN.length + 1);
  });

  it("drops optional steps for a smaller scope, and says so", () => {
    const { queue, summary } = revisePlan(PLAN, { preset: "smaller_scope", note: "" });
    expect(queue.some((s) => s.optional)).toBe(false);
    expect(summary).toContain("Polish");
  });

  it("says when there's nothing to change", () => {
    const plain: PlannedStep[] = [{ kind: "test", title: "Test" }];
    expect(revisePlan(plain, { preset: "smaller_scope", note: "" }).queue).toBe(plain);
    expect(revisePlan(plain, { preset: "no_schema", note: "" }).summary).toMatch(/No remaining step/);
  });

  it("re-plans around a free-text note", () => {
    const { queue } = revisePlan(PLAN, { preset: null, note: "Keep the API shape" });
    expect(queue[0]).toMatchObject({ kind: "plan", detail: "Keep the API shape", checkpoint: true });
  });
});

it("finds where steering would land", () => {
  expect(nextCheckpoint(PLAN)?.title).toBe("Plan");
  expect(nextCheckpoint([{ kind: "read", title: "Only" }])?.title).toBe("Only");
  expect(nextCheckpoint([])).toBeNull();
});

it("formats clocks and redirects", () => {
  expect(formatClock(7_400)).toBe("0:07");
  expect(formatClock(102_000)).toBe("1:42");
  expect(describeRedirect({ preset: "no_schema", note: " use an upsert " })).toBe("Don't touch the schema: use an upsert");
  expect(describeRedirect({ preset: null, note: "hi" })).toBe("hi");
});

it("gives every agent-run issue a plan that ends in resolve", () => {
  for (const n of [1432, 1429, 1421]) expect(planFor(n).at(-1)?.kind).toBe("resolve");
});
