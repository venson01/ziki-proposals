"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  REDIRECT_PRESETS,
  describeRedirect,
  formatClock,
  nextCheckpoint,
  planFor,
  runReducer,
  startRun,
  type EventKind,
  type RedirectPreset,
  type RunState,
} from "@/lib/agent-run";
import { STATUSES, formatIssueNumber, isDone, severityLabels, statusLabels, type Issue, type Status } from "@/lib/issues";
import { changeStatus, useIssuesStore } from "@/lib/store";
import {
  BotIcon,
  CheckIcon,
  EditIcon,
  FlagIcon,
  HammeringIcon,
  PauseIcon,
  PlanIcon,
  PlayIcon,
  PrIcon,
  ReadIcon,
  SearchIcon,
  SteerIcon,
  TestIcon,
  TypeIcon,
  UserIcon,
} from "@/components/icons";

const SPEEDS = { normal: 2600, fast: 1000 } as const;
type Speed = keyof typeof SPEEDS;

type SavedRun = { state: RunState; startedAt: number };
/** Runs survive moving between pages (not reloads), like an agent that keeps working. */
const runs = new Map<number, SavedRun>();

function freshRun(number: number): SavedRun {
  return { state: startRun(planFor(number)), startedAt: Date.now() };
}

const EVENT_ICONS: Record<EventKind, (p: { size?: number }) => React.ReactNode> = {
  read: ReadIcon,
  search: SearchIcon,
  plan: PlanIcon,
  edit: EditIcon,
  test: TestIcon,
  pr: PrIcon,
  resolve: CheckIcon,
  pause: PauseIcon,
  paused: PauseIcon,
  resume: PlayIcon,
  redirect: SteerIcon,
  ack: BotIcon,
};

function PhaseBadge({ state }: { state: RunState }) {
  if (state.phase === "done") return <span className="run-phase is-done"><CheckIcon size={12} /> Done</span>;
  if (state.phase === "paused") return <span className="run-phase is-paused"><PauseIcon size={12} /> Paused</span>;
  if (state.phase === "pausing") return <span className="run-phase is-pausing"><PauseIcon size={12} /> Pausing at next checkpoint</span>;
  return <span className="run-phase is-working"><HammeringIcon /> Working</span>;
}

function RedirectComposer({
  state,
  onSend,
  onClose,
}: {
  state: RunState;
  onSend: (preset: RedirectPreset | null, note: string) => void;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<RedirectPreset | null>(null);
  const [note, setNote] = useState("");
  const lands = nextCheckpoint(state.queue);
  const canSend = preset !== null || note.trim().length > 0;
  return (
    <form
      className="run-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        onSend(preset, note);
      }}
    >
      <fieldset>
        <legend>Change course</legend>
        <div className="run-chips">
          {REDIRECT_PRESETS.map((item) => (
            <button
              key={item.value}
              type="button"
              className="run-chip"
              aria-pressed={preset === item.value}
              onClick={() => setPreset(preset === item.value ? null : item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="run-note">
        <span>Note for the agent (optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="e.g. Keep the API response shape the same" />
      </label>
      <p className="run-composer-hint">
        {state.phase === "paused"
          ? "The agent is stopped at a checkpoint and will take this on right away."
          : lands
            ? <>Lands at the next checkpoint, after: <strong>{lands.title}</strong></>
            : "Lands at the next checkpoint."}
      </p>
      <div className="run-composer-actions">
        <button type="button" className="zk-button is-quiet" onClick={onClose}>Cancel</button>
        <button type="submit" className="zk-button is-primary" disabled={!canSend}>
          <SteerIcon size={14} /> Send to agent
        </button>
      </div>
    </form>
  );
}

function AgentRun({ issue, onRestart }: { issue: Issue; onRestart: () => void }) {
  const [initial] = useState<SavedRun>(() => runs.get(issue.number) ?? freshRun(issue.number));
  const { startedAt } = initial;
  const [state, dispatch] = useReducer(runReducer, initial.state);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [composing, setComposing] = useState(false);
  const [savedRules, setSavedRules] = useState<Set<number>>(() => new Set());
  const reported = useRef(initial.state.phase === "done");
  const agent = issue.worker ?? "Agent";
  const at = () => Date.now() - startedAt;

  useEffect(() => {
    runs.set(issue.number, { startedAt, state });
  }, [issue.number, startedAt, state]);

  const running = state.phase === "working" || state.phase === "pausing";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", at: Date.now() - startedAt }), SPEEDS[speed]);
    return () => window.clearInterval(timer);
  }, [running, speed, startedAt]);

  // The agent's last step resolves the issue: the bug flies off from the header.
  useEffect(() => {
    if (state.phase !== "done" || reported.current) return;
    reported.current = true;
    changeStatus(issue.number, "resolved", agent);
  }, [state.phase, issue.number, agent]);

  const upNext = state.queue[0];
  const lands = nextCheckpoint(state.queue);
  const events = [...state.events].reverse();
  const humanSteers = state.events.filter((e) => e.actor === "human").length;

  return (
    <section className="run" aria-labelledby="run-heading">
      <div className="run-head">
        <span className="run-avatar" aria-hidden="true"><BotIcon size={18} /></span>
        <div className="run-agent">
          <h2 id="run-heading">{agent}</h2>
          <p className="muted">Solver agent · Level 3 · claimed {formatIssueNumber(issue.number)}</p>
        </div>
        <div role="status" aria-live="polite" className="run-phase-wrap">
          <PhaseBadge state={state} />
        </div>
      </div>

      {state.phase !== "done" ? (
        <>
          <div className="run-next">
            <span className="run-next-label">{state.phase === "paused" ? "When resumed" : "Up next"}</span>
            <span className="run-next-title">{upNext ? upNext.title : "Wrapping up"}</span>
            {lands ? (
              <span className="run-next-checkpoint">
                <FlagIcon size={12} /> Next checkpoint after: {lands.title}
              </span>
            ) : null}
          </div>

          {state.phase === "pausing" ? (
            <p className="run-banner is-warn">Pause requested. {agent} will stop safely at the next checkpoint, so nothing is left half-written.</p>
          ) : null}
          {state.pendingRedirect ? (
            <p className="run-banner is-info">Redirect queued. {agent} takes it on at the next checkpoint.</p>
          ) : null}

          <div className="run-controls">
            {state.phase === "working" ? (
              <button type="button" className="zk-button" onClick={() => dispatch({ type: "pause", at: at() })}>
                <PauseIcon size={14} /> Pause
              </button>
            ) : (
              <button type="button" className="zk-button is-primary" onClick={() => dispatch({ type: "resume", at: at() })}>
                <PlayIcon size={14} /> Resume
              </button>
            )}
            <button type="button" className="zk-button" aria-expanded={composing} onClick={() => setComposing(!composing)}>
              <SteerIcon size={14} /> Redirect
            </button>
            <div className="run-speed" role="group" aria-label="Demo speed">
              {(Object.keys(SPEEDS) as Speed[]).map((value) => (
                <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
                  {value === "normal" ? "1×" : "2.5×"}
                </button>
              ))}
            </div>
          </div>

          {composing ? (
            <RedirectComposer
              state={state}
              onClose={() => setComposing(false)}
              onSend={(preset, note) => {
                dispatch({ type: "redirect", at: at(), redirect: { preset, note } });
                setComposing(false);
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="run-summary">
          <p>
            <strong>Run complete.</strong> {state.events.filter((e) => e.actor === "agent").length} agent steps, steered by you{" "}
            {humanSteers === 1 ? "once" : `${humanSteers} times`}.
          </p>
          {state.applied.length > 0 ? (
            <div className="run-rules">
              <p className="muted">
                Turn a redirect into a project rule. It goes into the Mistake Registry, so every agent sees it before starting work here.
              </p>
              <ul>
                {state.applied.map((redirect, index) => {
                  const text = describeRedirect(redirect);
                  const done = savedRules.has(index);
                  return (
                    <li key={index}>
                      <span>“{text}”</span>
                      <button
                        type="button"
                        className={`zk-button ${done ? "is-quiet" : ""}`}
                        disabled={done}
                        onClick={() => setSavedRules(new Set(savedRules).add(index))}
                      >
                        {done ? <><CheckIcon size={14} /> Saved as rule</> : "Save as project rule"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <button type="button" className="zk-button is-quiet" onClick={onRestart}>Run the demo again</button>
        </div>
      )}

      <div className="run-columns">
        <div>
          <h3 className="run-subhead">Live activity</h3>
          {events.length === 0 ? <p className="muted run-empty">{agent} is starting…</p> : null}
          <ol className="run-timeline">
            {events.map((event) => {
              const Icon = EVENT_ICONS[event.kind];
              return (
                <li key={event.id} className={`run-event is-${event.actor}`}>
                  <span className="run-event-icon" aria-hidden="true">
                    {event.actor === "human" ? <UserIcon size={14} /> : <Icon size={14} />}
                  </span>
                  <div className="run-event-body">
                    <p className="run-event-title">
                      <span className="sr-only">{event.actor === "human" ? "You" : event.actor === "agent" ? agent : "Ziki"}: </span>
                      {event.title}
                    </p>
                    {event.detail ? <p className="run-event-detail">{event.detail}</p> : null}
                  </div>
                  <span className="run-event-meta">
                    {event.checkpoint ? <span className="run-flag" title="Checkpoint: safe to pause here"><FlagIcon size={11} /><span className="sr-only">Checkpoint</span></span> : null}
                    <span className="mono tabular">{formatClock(event.at)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <aside aria-labelledby="plan-heading">
          <h3 id="plan-heading" className="run-subhead">Remaining plan <span className="muted">({state.queue.length})</span></h3>
          {state.queue.length === 0 ? <p className="muted run-empty">Nothing left.</p> : null}
          <ol className="run-plan">
            {state.queue.map((step, index) => (
              <li key={`${index}-${step.title}`} className={index === 0 && state.phase !== "paused" ? "is-current" : undefined}>
                <span className="run-plan-title">{step.title}</span>
                <span className="run-plan-tags">
                  {step.checkpoint ? <span className="run-tag"><FlagIcon size={10} /> checkpoint</span> : null}
                  {step.optional ? <span className="run-tag is-optional">optional</span> : null}
                  {step.schema ? <span className="run-tag is-schema">touches schema</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}

export function IssueRun({ number }: { number: number }) {
  const { issues, celebrating } = useIssuesStore();
  const [runKey, setRunKey] = useState(0);
  const issue = issues.find((item) => item.number === number);
  if (!issue) {
    return (
      <div className="detail">
        <p>That issue isn&apos;t in this prototype. <Link href="/issues">Back to Issues</Link></p>
      </div>
    );
  }
  const phase = celebrating.get(issue.number);
  return (
    <div className="detail">
      <Link href="/issues" className="detail-back">← Issues</Link>
      <header className="detail-head" data-celebrating={phase === "flying" ? "flying" : undefined} data-done={isDone(issue.status) || undefined}>
        <span className={`issues-type-disc is-${issue.type} is-large`} data-bug-origin={issue.number} aria-hidden="true">
          <span className="issues-type-icon"><TypeIcon type={issue.type} size={20} /></span>
          <span className="issues-type-done"><CheckIcon size={20} /></span>
        </span>
        <div className="detail-title">
          <h1>{issue.title}</h1>
          <p className="muted">
            <span className="mono">{formatIssueNumber(issue.number)}</span> · {issue.category} · {severityLabels[issue.severity]} priority · reported by {issue.reporter}
          </p>
        </div>
        <label className="issues-status-select is-detail">
          <span className="sr-only">Status</span>
          <select value={issue.status} onChange={(event) => changeStatus(issue.number, event.target.value as Status)}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabels[status]}</option>
            ))}
          </select>
        </label>
      </header>

      {issue.agentRun && (issue.status === "in_progress" || runs.has(issue.number)) ? (
        <AgentRun
          key={runKey}
          issue={issue}
          onRestart={() => {
            runs.delete(issue.number);
            changeStatus(issue.number, "in_progress");
            setRunKey(runKey + 1);
          }}
        />
      ) : (
        <section className="run run-idle">
          <p>
            {isDone(issue.status)
              ? "This issue is done. No agent is working on it."
              : "No agent is working on this issue yet. Agents bid on issues once they're confirmed and ready."}
          </p>
          <p className="muted">
            Try <Link href="/issues/1432">#1432</Link>, where an agent is at work, to see Live steer &amp; pause.
          </p>
        </section>
      )}
    </div>
  );
}
