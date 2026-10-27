/**
 * Live steer & pause: a simulated agent run that a person can pause and
 * redirect while it works. Pure state so the rules are testable:
 *
 * - The agent always shows its next step before it takes it.
 * - Pause and Redirect take effect at the next checkpoint: a point the agent
 *   declares safe to stop (nothing half-written).
 * - A redirect changes the remaining plan, and the agent says how.
 */

export type StepKind = "read" | "search" | "plan" | "edit" | "test" | "pr" | "resolve";

export type PlannedStep = {
  kind: StepKind;
  title: string;
  detail?: string;
  /** Safe to stop after this step. */
  checkpoint?: boolean;
  /** Dropped by "Smaller scope". */
  optional?: boolean;
  /** Dropped by "Don't touch the schema"; replaced by `alt` when given. */
  schema?: boolean;
  alt?: PlannedStep;
};

export type RedirectPreset = "tests_first" | "smaller_scope" | "no_schema" | "reuse_existing";

export const REDIRECT_PRESETS: { value: RedirectPreset; label: string }[] = [
  { value: "tests_first", label: "Write a failing test first" },
  { value: "smaller_scope", label: "Smaller scope" },
  { value: "no_schema", label: "Don't touch the schema" },
  { value: "reuse_existing", label: "Reuse what exists" },
];

export type Redirect = { preset: RedirectPreset | null; note: string };

export type EventKind = StepKind | "pause" | "paused" | "resume" | "redirect" | "ack";

export type RunEvent = {
  id: number;
  actor: "agent" | "human" | "system";
  kind: EventKind;
  title: string;
  detail?: string;
  checkpoint?: boolean;
  /** Milliseconds since the run started. */
  at: number;
};

/** working → pausing (asked, waiting for a checkpoint) → paused; done is final. */
export type RunPhase = "working" | "pausing" | "paused" | "done";

export type RunState = {
  phase: RunPhase;
  events: RunEvent[];
  queue: PlannedStep[];
  /** A redirect waiting for the next checkpoint. */
  pendingRedirect: Redirect | null;
  /** Redirects the agent has taken on, for the "save as project rule" prompt. */
  applied: Redirect[];
  nextId: number;
};

export type RunAction =
  | { type: "tick"; at: number }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "redirect"; at: number; redirect: Redirect };

export function startRun(plan: PlannedStep[]): RunState {
  return { phase: "working", events: [], queue: plan, pendingRedirect: null, applied: [], nextId: 1 };
}

function push(state: RunState, event: Omit<RunEvent, "id">): RunState {
  return { ...state, events: [...state.events, { ...event, id: state.nextId }], nextId: state.nextId + 1 };
}

export function presetLabel(preset: RedirectPreset): string {
  return REDIRECT_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

export function describeRedirect(redirect: Redirect): string {
  const parts = [redirect.preset ? presetLabel(redirect.preset) : null, redirect.note.trim() || null];
  return parts.filter(Boolean).join(": ");
}

/** The remaining plan after a redirect, and one line saying what changed. */
export function revisePlan(queue: PlannedStep[], redirect: Redirect): { queue: PlannedStep[]; summary: string } {
  const note = redirect.note.trim();
  switch (redirect.preset) {
    case "tests_first": {
      const first: PlannedStep = {
        kind: "test",
        title: "Write a failing test that reproduces the issue",
        detail: note || "The test goes in first, so the fix is proven against it.",
        checkpoint: true,
      };
      return { queue: [first, ...queue], summary: "Added a failing test before any more code changes." };
    }
    case "smaller_scope": {
      const dropped = queue.filter((step) => step.optional);
      if (dropped.length === 0) return { queue, summary: "The plan was already minimal; nothing to drop." };
      return {
        queue: queue.filter((step) => !step.optional),
        summary: `Dropped ${dropped.length} optional ${dropped.length === 1 ? "step" : "steps"}: ${dropped.map((s) => s.title).join("; ")}.`,
      };
    }
    case "no_schema": {
      const touched = queue.filter((step) => step.schema);
      if (touched.length === 0) return { queue, summary: "No remaining step touches the schema." };
      const next = queue.flatMap((step) => (step.schema ? (step.alt ? [step.alt] : []) : [step]));
      const alts = touched.filter((s) => s.alt).map((s) => s.alt!.title);
      return {
        queue: next,
        summary: `Removed the schema change${alts.length ? `; instead: ${alts.join("; ")}` : ""}.`,
      };
    }
    case "reuse_existing": {
      const look: PlannedStep = {
        kind: "search",
        title: "Look for an existing helper or component to reuse",
        detail: note || "Searching lib/ and components/ before writing anything new.",
        checkpoint: true,
      };
      return { queue: [look, ...queue], summary: "Will search for something to reuse before writing new code." };
    }
    default: {
      const replan: PlannedStep = { kind: "plan", title: "Re-plan around your note", detail: note, checkpoint: true };
      return { queue: [replan, ...queue], summary: "Re-planning the remaining steps around your note." };
    }
  }
}

function applyRedirect(state: RunState, redirect: Redirect, at: number): RunState {
  const { queue, summary } = revisePlan(state.queue, redirect);
  const next = push(state, { actor: "agent", kind: "ack", title: "Got it. Changing course.", detail: summary, at });
  return { ...next, queue, pendingRedirect: null, applied: [...state.applied, redirect] };
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case "tick": {
      if (state.phase === "paused" || state.phase === "done") return state;
      const [step, ...rest] = state.queue;
      if (!step) return { ...state, phase: "done" };
      let next = push(
        { ...state, queue: rest },
        { actor: "agent", kind: step.kind, title: step.title, detail: step.detail, checkpoint: step.checkpoint, at: action.at },
      );
      if (step.kind === "resolve") return { ...next, phase: "done", pendingRedirect: null };
      // Steering lands only where the agent said it's safe to stop.
      if (step.checkpoint || rest.length === 0) {
        if (next.pendingRedirect) next = applyRedirect(next, next.pendingRedirect, action.at);
        if (next.phase === "pausing") {
          next = push(
            { ...next, phase: "paused" },
            { actor: "system", kind: "paused", title: "Paused at a checkpoint", detail: `Stopped safely after: ${step.title}`, at: action.at },
          );
        }
      }
      return next;
    }
    case "pause": {
      if (state.phase !== "working") return state;
      return push({ ...state, phase: "pausing" }, { actor: "human", kind: "pause", title: "You asked the agent to pause", at: action.at });
    }
    case "resume": {
      if (state.phase !== "paused" && state.phase !== "pausing") return state;
      return push({ ...state, phase: "working" }, { actor: "human", kind: "resume", title: "You resumed the agent", at: action.at });
    }
    case "redirect": {
      if (state.phase === "done") return state;
      const { redirect } = action;
      if (!redirect.preset && !redirect.note.trim()) return state;
      const next = push(state, { actor: "human", kind: "redirect", title: "You redirected the agent", detail: describeRedirect(redirect), at: action.at });
      // Paused means already at a checkpoint: the agent takes it on now.
      if (state.phase === "paused") return applyRedirect(next, redirect, action.at);
      return { ...next, pendingRedirect: redirect };
    }
  }
}

/** The step after which a pause or redirect would land. */
export function nextCheckpoint(queue: PlannedStep[]): PlannedStep | null {
  return queue.find((step) => step.checkpoint) ?? queue[queue.length - 1] ?? null;
}

/** "0:07", "1:42". */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const VOTE_PLAN: PlannedStep[] = [
  { kind: "read", title: "Read the issue, 6 comments and the repro video" },
  {
    kind: "search",
    title: "Checked the Mistake Registry: 2 known anti-patterns for Voting",
    detail: "Don't fix double-submits with a client-only debounce; votes must be idempotent on the server.",
    checkpoint: true,
  },
  {
    kind: "plan",
    title: "Plan: make voting idempotent and disable the button while a vote is in flight",
    checkpoint: true,
  },
  {
    kind: "edit",
    title: "Add a unique (userId, issueId) constraint to votes",
    detail: "prisma/schema.prisma + a new migration",
    checkpoint: true,
    schema: true,
    alt: {
      kind: "edit",
      title: "Make the vote action idempotent with an upsert",
      detail: "app/actions/vote.ts",
      checkpoint: true,
    },
  },
  { kind: "edit", title: "Disable the vote button while the request is in flight", detail: "components/vote-button.tsx", checkpoint: true },
  { kind: "edit", title: "Animate the vote count with a spring", detail: "components/vote-button.tsx", optional: true },
  { kind: "test", title: "Ran pnpm test: 412 passed, 0 failed", checkpoint: true },
  { kind: "pr", title: "Opened a PR with screenshots and test output", detail: "Review status: submitted", checkpoint: true },
  { kind: "resolve", title: "Two testers verified the fix. Marked resolved." },
];

const INBOX_PLAN: PlannedStep[] = [
  { kind: "read", title: "Read the issue and reproduced it locally" },
  { kind: "search", title: "Checked the Mistake Registry: nothing for Inbox", checkpoint: true },
  { kind: "plan", title: "Plan: clear the badge when the question is answered, not when it's opened", checkpoint: true },
  { kind: "edit", title: "Store answeredAt and refresh the badge count", detail: "lib/inbox.ts", checkpoint: true },
  { kind: "edit", title: "Add a 'Mark all read' shortcut", detail: "components/inbox-button.tsx", optional: true },
  { kind: "test", title: "Ran pnpm test: 398 passed, 0 failed", checkpoint: true },
  { kind: "pr", title: "Opened a PR with screenshots and test output", checkpoint: true },
  { kind: "resolve", title: "Verified by two testers. Marked resolved." },
];

const MERGE_PLAN: PlannedStep[] = [
  { kind: "read", title: "Read the issue and the admin-merge route" },
  { kind: "plan", title: "Plan: fall back to a plain git merge when the GitHub App is missing", checkpoint: true },
  {
    kind: "edit",
    title: "Add a githubAppConfigured flag to project settings",
    detail: "prisma/schema.prisma",
    checkpoint: true,
    schema: true,
    alt: { kind: "edit", title: "Read the GitHub App config from the environment instead", detail: "lib/github.ts", checkpoint: true },
  },
  { kind: "edit", title: "Use the fallback in admin-merge", detail: "app/api/v1/issues/[id]/admin-merge/route.ts", checkpoint: true },
  { kind: "test", title: "Ran pnpm test: 405 passed, 0 failed", checkpoint: true },
  { kind: "pr", title: "Opened a PR with test output", checkpoint: true },
  { kind: "resolve", title: "Merged and verified. Marked resolved." },
];

export function planFor(issueNumber: number): PlannedStep[] {
  if (issueNumber === 1429) return INBOX_PLAN;
  if (issueNumber === 1421) return MERGE_PLAN;
  return VOTE_PLAN;
}
