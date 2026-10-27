import { describe, expect, it } from "vitest";
import {
  CLAIM_MINUTES,
  claimDeadline,
  describeRedirect,
  formatClock,
  isStopped,
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
const tickAt = (at: number): RunAction => ({ type: "tick", at });

const ASK_PLAN: PlannedStep[] = [
  { kind: "plan", title: "Plan", checkpoint: true },
  {
    kind: "ask",
    title: "Schema change OK?",
    checkpoint: true,
    options: [{ label: "Go ahead" }, { label: "Keep the schema", preset: "no_schema" }],
  },
  { kind: "edit", title: "Schema", checkpoint: true, schema: true, alt: { kind: "edit", title: "Upsert", checkpoint: true } },
  { kind: "resolve", title: "Resolve" },
];
const MINUTES = CLAIM_MINUTES * 60_000;

describe("waiting on you", () => {
  it("stops to ask, and stops the claim clock while it waits", () => {
    const state = run(startRun(ASK_PLAN), tickAt(0), tickAt(1_000));
    expect(state.phase).toBe("waiting");
    expect(isStopped(state.phase)).toBe(true);
    expect(state.question?.title).toBe("Schema change OK?");
    expect(state.events.at(-1)).toMatchObject({ actor: "agent", kind: "ask" });
    expect(claimDeadline(0, state)).toBeNull();
    expect(runReducer(state, tickAt(2_000))).toBe(state);
  });

  it("carries on as planned after a plain answer, with the stopped time added to the deadline", () => {
    const state = run(startRun(ASK_PLAN), tickAt(0), tickAt(1_000), { type: "answer", at: 6_000, option: 0, note: "" });
    expect(state.phase).toBe("working");
    expect(state.question).toBeNull();
    expect(state.events.map((e) => e.title).slice(-2)).toEqual(["You answered: Go ahead", "Thanks. Carrying on as planned."]);
    expect(state.queue[0].title).toBe("Schema");
    expect(state.stoppedMs).toBe(5_000);
    expect(claimDeadline(0, state)).toBe(MINUTES + 5_000);
    expect(state.applied).toHaveLength(0);
  });

  it("changes course after an answer with a preset, and offers it as a rule", () => {
    const state = run(startRun(ASK_PLAN), tick, tick, { type: "answer", at: 0, option: 1, note: "" });
    expect(state.queue[0].title).toBe("Upsert");
    expect(state.events.at(-1)?.kind).toBe("ack");
    expect(state.applied).toEqual([{ preset: "no_schema", note: "" }]);
  });

  it("re-plans around an answer given only as a note", () => {
    const state = run(startRun(ASK_PLAN), tick, tick, { type: "answer", at: 0, option: null, note: "Use the votes table" });
    expect(state.queue[0]).toMatchObject({ kind: "plan", detail: "Use the votes table" });
    expect(state.events.find((e) => e.kind === "answer")?.title).toBe("You answered with a note");
  });

  it("ignores empty answers, and answers when nothing was asked", () => {
    const waiting = run(startRun(ASK_PLAN), tick, tick);
    expect(runReducer(waiting, { type: "answer", at: 0, option: null, note: "  " })).toBe(waiting);
    const working = startRun(ASK_PLAN);
    expect(runReducer(working, { type: "answer", at: 0, option: 0, note: "" })).toBe(working);
  });

  it("keeps a pause asked for before the question once it's answered", () => {
    let state = run(startRun(ASK_PLAN), tickAt(0), { type: "pause", at: 500 }, tickAt(1_000));
    expect(state.phase).toBe("waiting");
    expect(state.afterAnswer).toBe("paused");
    state = runReducer(state, { type: "answer", at: 3_000, option: 0, note: "" });
    expect(state.phase).toBe("paused");
    expect(state.events.at(-1)?.kind).toBe("paused");
    expect(claimDeadline(0, state)).toBeNull();
    state = runReducer(state, { type: "resume", at: 4_000 });
    expect(claimDeadline(0, state)).toBe(MINUTES + 3_000);
  });

  it("takes on a redirect right away while waiting", () => {
    const state = run(startRun(ASK_PLAN), tick, tick, { type: "redirect", at: 0, redirect: { preset: "tests_first", note: "" } });
    expect(state.phase).toBe("waiting");
    expect(state.pendingRedirect).toBeNull();
    expect(state.queue[0].kind).toBe("test");
  });

  it("ignores pause while waiting", () => {
    const waiting = run(startRun(ASK_PLAN), tick, tick);
    expect(runReducer(waiting, { type: "pause", at: 0 })).toBe(waiting);
  });
});

describe("claim clock", () => {
  it("adds paused time to the deadline", () => {
    let state = run(startRun(PLAN), tickAt(0), { type: "pause", at: 500 }, tickAt(1_000));
    expect(state.phase).toBe("paused");
    expect(claimDeadline(0, state)).toBeNull();
    state = runReducer(state, { type: "resume", at: 4_000 });
    expect(claimDeadline(0, state)).toBe(MINUTES + 3_000);
  });

  it("doesn't stop while a pause is only requested", () => {
    const state = run(startRun(PLAN), { type: "pause", at: 0 });
    expect(state.phase).toBe("pausing");
    expect(claimDeadline(100, state)).toBe(100 + MINUTES);
  });
});

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
