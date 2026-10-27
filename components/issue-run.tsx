"use client";

import Link from "next/link";
import { useEffect, useId, useReducer, useRef, useState } from "react";
import {
  REDIRECT_PRESETS,
  claimDeadline,
  describeRedirect,
  formatClock,
  isStopped,
  nextCheckpoint,
  planFor,
  runReducer,
  startRun,
  type EventKind,
  type RedirectPreset,
  type RunAction,
  type RunEvent,
  type RunState,
} from "@/lib/agent-run";
import { STATUSES, formatAge, formatIssueNumber, isDone, severityLabels, statusLabels, type Issue, type Status } from "@/lib/issues";
import { detailFor, shortSaying, stageLabels, type BotDecision, type IssueComment, type IssueDetail } from "@/lib/issue-details";
import { avatarTone, initialsOf } from "@/lib/avatar";
import { changeStatus, replayResolved, useIssuesStore, type CelebrationPhase } from "@/lib/store";
import {
  BotIcon,
  CheckIcon,
  CommentIcon,
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
  UserIcon,
} from "@/components/icons";

const SPEEDS = { normal: 2600, fast: 1000 } as const;
type Speed = keyof typeof SPEEDS;
/** Prototype only: see the card as someone who can steer, or as a teammate who can't. */
type Viewer = "owner" | "teammate";
/** Recent steps shown before "Show all". */
const RECENT = 3;

/** A run action before its timestamp is added (Omit kept per union member). */
type RunCommand = RunAction extends infer A ? (A extends RunAction ? Omit<A, "at"> : never) : never;

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
  ask: CommentIcon,
  resolve: CheckIcon,
  pause: PauseIcon,
  paused: PauseIcon,
  resume: PlayIcon,
  redirect: SteerIcon,
  ack: BotIcon,
  answer: CommentIcon,
};

/** The run's state in a word or two, for the card and the Status box. */
function PhasePill({ state }: { state: RunState }) {
  switch (state.phase) {
    case "done":
      return <span className="run-phase is-done"><CheckIcon size={12} /> Done</span>;
    case "paused":
      return <span className="run-phase is-paused"><PauseIcon size={12} /> Paused</span>;
    case "pausing":
      return <span className="run-phase is-pausing"><PauseIcon size={12} /> Pausing at next checkpoint</span>;
    case "waiting":
      return <span className="run-phase is-waiting"><CommentIcon size={12} /> Waiting on you</span>;
    default:
      return <span className="run-phase is-working"><HammeringIcon /> Working</span>;
  }
}

/** The bot face from the real decisions strip, on the agent's tone, with an optional verdict badge. */
function BotAvatar({ name, verdict, small = false }: { name: string; verdict?: BotDecision["kind"]; small?: boolean }) {
  return (
    <span className={`bot-avatar${small ? " is-small" : ""}`} aria-hidden="true" title={name}>
      <span className={`bot-avatar-face tone-${avatarTone(name)}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="4" y="8" width="16" height="12" rx="3" />
          <path d="M12 8V4M9 14h.01M15 14h.01" strokeLinecap="round" />
          <circle cx="12" cy="3.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {verdict ? <span className={`bot-avatar-verdict is-${verdict}`}><VerdictGlyph kind={verdict} /></span> : null}
    </span>
  );
}

function deadlineText(startedAt: number, state: RunState): string {
  const at = claimDeadline(startedAt, state);
  if (at === null) return "Clock stopped";
  return `Deliver by ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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
        if (canSend) onSend(preset, note);
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
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Keep the API response shape the same" />
      </label>
      <p className="run-composer-hint">
        {isStopped(state.phase)
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

/** The agent's question, in the card: "Waiting on you". */
function AskBox({
  state,
  agent,
  owner,
  canSteer,
  onAnswer,
}: {
  state: RunState;
  agent: string;
  owner: string;
  canSteer: boolean;
  onAnswer: (option: number | null, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const question = state.question!;
  return (
    <div className="ls-ask">
      <span className="ls-ask-label">{agent} is waiting on {canSteer ? "you" : owner}</span>
      <p className="ls-ask-question">{question.title}</p>
      {question.detail ? <p className="ls-ask-detail">{question.detail}</p> : null}
      {canSteer ? (
        <form
          className="ls-ask-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim()) onAnswer(null, note);
          }}
        >
          <div className="ls-ask-options">
            {(question.options ?? []).map((option, index) => (
              <button key={option.label} type="button" className={`zk-button${index === 0 ? " is-primary" : ""}`} onClick={() => onAnswer(index, note)}>
                {option.label}
              </button>
            ))}
          </div>
          <label className="run-note">
            <span>Or answer in your own words</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Use the existing votes table, no new columns" />
          </label>
          <div className="run-composer-actions">
            <button type="submit" className="zk-button" disabled={!note.trim()}>Send answer</button>
          </div>
        </form>
      ) : (
        <p className="ls-ask-detail">Waiting for {owner} to answer. The claim clock is stopped meanwhile.</p>
      )}
    </div>
  );
}

function StepRow({ event, agent }: { event: RunEvent; agent: string }) {
  const Icon = EVENT_ICONS[event.kind];
  return (
    <li className={`run-event is-${event.actor}`}>
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
}

/** Live steer: one card in the main column, under the agent decisions strip. */
function LiveSteerCard({
  issue,
  owner,
  state,
  startedAt,
  canSteer,
  act,
  onRestart,
}: {
  issue: Issue;
  owner: string;
  state: RunState;
  startedAt: number;
  canSteer: boolean;
  act: (command: RunCommand) => void;
  onRestart: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [savedRules, setSavedRules] = useState<Set<number>>(() => new Set());
  const agent = issue.worker ?? "Agent";
  const done = state.phase === "done";
  const upNext = state.queue[0];
  const lands = nextCheckpoint(state.queue);
  const events = [...state.events].reverse();
  const shown = showAll ? events : events.slice(0, RECENT);
  const humanSteers = state.events.filter((e) => e.actor === "human").length;

  return (
    <section id="live" className="iss-card ls" data-phase={state.phase} aria-labelledby="ls-heading">
      <div className="ls-head">
        <BotAvatar name={agent} />
        <div className="ls-who">
          <h2 id="ls-heading">
            {done ? null : <span className="ls-live-dot" aria-hidden="true" />}
            {done ? "Run finished" : "Live"} · {agent}
          </h2>
          <p>
            for {owner}
            {done ? null : <> · <span suppressHydrationWarning>{deadlineText(startedAt, state)}</span></>}
          </p>
        </div>
        <div role="status" aria-live="polite">
          <PhasePill state={state} />
        </div>
      </div>

      {done ? (
        <div className="run-summary">
          <p>
            <strong>{state.events.filter((e) => e.actor === "agent").length} steps.</strong> Steered{" "}
            {humanSteers === 0 ? "not at all" : humanSteers === 1 ? "once" : `${humanSteers} times`}.
          </p>
          {state.applied.length > 0 ? (
            <div className="run-rules">
              <p className="muted">Turn a steer into a project rule. It goes into the Mistake Registry, so every agent sees it before starting work here.</p>
              <ul>
                {state.applied.map((redirect, index) => {
                  const saved = savedRules.has(index);
                  return (
                    <li key={index}>
                      <span>“{describeRedirect(redirect)}”</span>
                      <button type="button" className={`zk-button ${saved ? "is-quiet" : ""}`} disabled={saved} onClick={() => setSavedRules(new Set(savedRules).add(index))}>
                        {saved ? <><CheckIcon size={14} /> Saved as rule</> : "Save as project rule"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <button type="button" className="zk-button is-quiet" onClick={onRestart}>Run the demo again</button>
        </div>
      ) : (
        <>
          {state.phase === "waiting" ? (
            <AskBox state={state} agent={agent} owner={owner} canSteer={canSteer} onAnswer={(option, note) => act({ type: "answer", option, note })} />
          ) : (
            <div className="run-next">
              <span className="run-next-label">{state.phase === "paused" ? "When resumed" : "Up next"}</span>
              <span className="run-next-title">{upNext ? upNext.title : "Wrapping up"}</span>
              <span className="run-next-checkpoint">
                {lands ? <><FlagIcon size={12} /> Next checkpoint after: {lands === upNext ? "this step" : lands.title}</> : null}
                {upNext?.schema ? <span className="run-tag is-schema">touches schema</span> : null}
                {upNext?.optional ? <span className="run-tag is-optional">optional</span> : null}
              </span>
            </div>
          )}

          {state.phase === "pausing" ? (
            <p className="run-banner is-warn">Pause requested. {agent} will stop safely at the next checkpoint, so nothing is left half-written.</p>
          ) : null}
          {state.pendingRedirect ? <p className="run-banner is-info">Redirect queued. {agent} takes it on at the next checkpoint.</p> : null}

          {canSteer ? (
            <>
              <div className="run-controls">
                {state.phase === "working" ? (
                  <button type="button" className="zk-button" onClick={() => act({ type: "pause" })}>
                    <PauseIcon size={14} /> Pause
                  </button>
                ) : state.phase === "waiting" ? null : (
                  <button type="button" className="zk-button is-primary" onClick={() => act({ type: "resume" })}>
                    <PlayIcon size={14} /> Resume
                  </button>
                )}
                <button type="button" className="zk-button" aria-expanded={composing} onClick={() => setComposing(!composing)}>
                  <SteerIcon size={14} /> Redirect
                </button>
              </div>
              {composing ? (
                <RedirectComposer
                  state={state}
                  onClose={() => setComposing(false)}
                  onSend={(preset, note) => {
                    act({ type: "redirect", redirect: { preset, note } });
                    setComposing(false);
                  }}
                />
              ) : null}
            </>
          ) : (
            <p className="ls-readonly">Only {owner}, the reporter and project admins can steer this agent.</p>
          )}
        </>
      )}

      <div className="ls-steps">
        <h3 className="iss-label">Recent steps</h3>
        {events.length === 0 ? <p className="muted ls-empty">{agent} is starting…</p> : null}
        <ol className="run-timeline">
          {shown.map((event) => <StepRow key={event.id} event={event} agent={agent} />)}
        </ol>
        {events.length > RECENT ? (
          <button type="button" className="ls-link" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${events.length} steps`}
          </button>
        ) : null}
      </div>

      {!done && state.queue.length > 0 ? (
        <details className="ls-plan">
          <summary>Remaining plan ({state.queue.length})</summary>
          <ol>
            {state.queue.map((step, index) => (
              <li key={`${index}-${step.title}`}>
                <span>{step.title}</span>
                <span className="run-plan-tags">
                  {step.checkpoint ? <span className="run-tag"><FlagIcon size={10} /> checkpoint</span> : null}
                  {step.optional ? <span className="run-tag is-optional">optional</span> : null}
                  {step.schema ? <span className="run-tag is-schema">touches schema</span> : null}
                  {step.kind === "ask" ? <span className="run-tag is-ask">asks you</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function VerdictGlyph({ kind }: { kind: BotDecision["kind"] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      {kind === "claimed" ? <path d="M12 5v14M5 12h14" strokeLinecap="round" /> : <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** What a decision means, in a sentence, for the expanded list. */
function decisionSentence(decision: BotDecision): React.ReactNode {
  if (decision.kind === "claimed") {
    return <><strong>{decision.agent}</strong> claimed this issue for {decision.person}.</>;
  }
  return (
    <>
      <strong>{decision.agent}</strong> confirmed this issue is real
      {decision.severity ? <> and rated it {severityLabels[decision.severity].toLowerCase()} priority</> : null} on behalf of {decision.person}.
    </>
  );
}

/** Agent decisions, as components/agent-decisions-summary.tsx draws them: a count tile and a drifting strip of bot cards. */
function AgentDecisionsSummary({ decisions, passed }: { decisions: BotDecision[]; passed: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const animate = decisions.length >= 3;
  const cards = (copy: boolean) => (
    <ul className="ads-cards" aria-hidden={copy || undefined}>
      {decisions.map((decision) => (
        <li key={`${decision.agent}-${decision.kind}`}>
          <button type="button" tabIndex={copy ? -1 : undefined} className="ads-card" title={`Show what ${decision.agent} said`} onClick={() => setOpen(true)}>
            <BotAvatar name={decision.agent} verdict={decision.kind} />
            <span className="ads-card-text">
              <span className="ads-card-name">{decision.agent}</span>
              <span className="ads-card-saying">“{shortSaying(decision)}”</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Agent decisions" className="iss-card is-strip">
      <div className="ads-row">
        <div className={`ads-count${passed ? " is-passed" : ""}`}>
          {passed ? (
            <span className="ads-passed" title="Passed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="sr-only">Passed</span>
            </span>
          ) : null}
          <span className="ads-number tabular">{decisions.length}</span>
          <h2 className="ads-label">Agent decisions</h2>
        </div>
        {decisions.length === 0 ? (
          <p className="ads-empty">No agent decisions yet.</p>
        ) : (
          <div className={`ads-marquee${animate ? " is-animated" : ""}`}>
            <div className="ads-track" style={animate ? ({ "--ads-duration": `${decisions.length * 6}s` } as React.CSSProperties) : undefined}>
              {cards(false)}
              {animate ? cards(true) : null}
            </div>
          </div>
        )}
      </div>
      {decisions.length > 0 ? (
        <>
          <button type="button" className="ads-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
            <span>{open ? "Hide decisions" : `Show all ${decisions.length} decisions`}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={open ? "is-open" : undefined}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open ? (
            <ol id={panelId} className="ads-list">
              {decisions.map((decision) => (
                <li key={`${decision.agent}-${decision.kind}`}>
                  <BotAvatar name={decision.agent} verdict={decision.kind} />
                  <p>{decisionSentence(decision)}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function PersonAvatar({ name, solid = false }: { name: string; solid?: boolean }) {
  return <span className={`iss-avatar ${solid ? "is-solid" : `tone-${avatarTone(name)}`}`} aria-hidden="true">{initialsOf(name)}</span>;
}

/** A person as UserNameWithBadges shows them: avatar, name, "via agent" pill, Creator badge. */
function PersonName({ name, agent, creator = false }: { name: string; agent?: string; creator?: boolean }) {
  return (
    <span className="iss-person">
      <PersonAvatar name={name} />
      <span className="iss-person-name">{name}</span>
      {agent ? (
        <span className="iss-agent-pill" aria-label={`via ${agent} (agent)`}>
          <span>via {agent}</span>
          <span className="iss-agent-tag" aria-hidden="true">agent</span>
        </span>
      ) : null}
      {creator ? <span className="iss-creator">Creator</span> : null}
    </span>
  );
}

/** The large vote control from the issue header ("Upvote 14"). */
function VoteControl({ votes }: { votes: number }) {
  const [upvoted, setUpvoted] = useState(false);
  const count = votes + (upvoted ? 1 : 0);
  return (
    <button
      type="button"
      className={`iss-vote${upvoted ? " is-on" : ""}`}
      aria-pressed={upvoted}
      aria-label={`${upvoted ? "Upvoted" : "Upvote"} ${count} ${count === 1 ? "vote" : "votes"}`}
      onClick={() => setUpvoted(!upvoted)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
      <span>{upvoted ? "Upvoted" : "Upvote"}</span>
      <span className="iss-vote-count tabular">{count}</span>
    </button>
  );
}

/** "Update status" (components/update-issue-form.tsx without triage rights): one select and Save changes. */
function UpdateStatusCard({ issue }: { issue: Issue }) {
  const [draft, setDraft] = useState<Status>(issue.status);
  const [seen, setSeen] = useState<Status>(issue.status);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // An agent can change the status too: follow it unless there's an unsaved edit.
  if (issue.status !== seen) {
    setSeen(issue.status);
    setDraft(issue.status);
  }
  const dirty = draft !== issue.status;
  return (
    <form
      className="iss-card is-form"
      aria-labelledby="iss-update-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty) return;
        changeStatus(issue.number, draft);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      }}
    >
      <h2 id="iss-update-heading" className="iss-form-title">Update status</h2>
      <div className="iss-form-grid">
        <div>
          <label htmlFor="iss-status" className="iss-field-label">Status</label>
          <select
            id="iss-status"
            className="iss-select"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value as Status);
              setSavedAt(null);
            }}
          >
            {STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </div>
      </div>
      <p role="status" aria-live="polite" className="iss-saved">
        {savedAt ? <>Saved. <span>{savedAt}</span></> : null}
      </p>
      <div className="iss-form-actions">
        <button type="submit" className="iss-button is-primary" disabled={!dirty}>Save changes</button>
        {dirty ? <span className="iss-unsaved">Unsaved changes</span> : null}
      </div>
    </form>
  );
}

function MergeDecisionsCard() {
  return (
    <section className="iss-card is-wide" aria-labelledby="iss-merge-heading">
      <h2 id="iss-merge-heading" className="iss-label is-count">Merge decisions <span className="iss-count">0</span></h2>
      <div role="status" className="iss-merge-empty">
        <span className="iss-merge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 9v12M6 9a9 9 0 0 0 9 9" strokeLinecap="round" /></svg>
        </span>
        <div>
          <p className="iss-merge-title">No merge decisions yet</p>
          <p className="iss-merge-detail">Awaiting review by a merger.</p>
        </div>
      </div>
    </section>
  );
}

const COMMENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "comment", label: "Comments" },
  { id: "bid", label: "Bids" },
  { id: "review", label: "Reviews" },
  { id: "delivery", label: "Deliveries" },
  { id: "request_to_merge", label: "Merge requests" },
] as const;
type CommentFilter = (typeof COMMENT_FILTERS)[number]["id"];

function ConversationCard({ issue, detail }: { issue: Issue; detail: IssueDetail }) {
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<IssueComment[]>([]);
  const comments = [...detail.comments, ...added];
  // Every mock comment is a plain comment; the other types count zero.
  const countFor = (id: CommentFilter) => (id === "all" || id === "comment" ? comments.length : 0);
  const shown = filter === "all" || filter === "comment" ? comments : [];
  return (
    <section id="conversation" className="iss-card is-wide" aria-labelledby="iss-conversation-heading">
      <div className="iss-conversation-head">
        <h2 id="iss-conversation-heading" className="iss-label is-count">Conversation <span className="iss-count">{comments.length}</span></h2>
        <button type="button" className="iss-add-comment" aria-expanded={composing} onClick={() => setComposing(!composing)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Add comment
        </button>
      </div>
      {composing ? (
        <form
          className="iss-comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            setAdded([...added, { author: detailOwnerOrYou(detail), body: draft.trim(), minsAgo: 0 }]);
            setDraft("");
            setComposing(false);
          }}
        >
          <label className="sr-only" htmlFor="iss-comment-body">Comment</label>
          <textarea id="iss-comment-body" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Leave a comment" />
          <div className="iss-form-actions">
            <button type="submit" className="iss-button is-primary" disabled={!draft.trim()}>Comment</button>
            <button type="button" className="iss-button is-ghost" onClick={() => setComposing(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
      <div className="iss-thread">
        {comments.length > 0 ? (
          <div className="iss-filters">
            {COMMENT_FILTERS.map((tab) => (
              <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className="iss-filter">
                {tab.label}
                <span className="iss-filter-count tabular">{countFor(tab.id)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {shown.length === 0 ? (
          <p className="iss-empty">{comments.length === 0 ? "No comments yet." : "Nothing of this type yet."}</p>
        ) : (
          <ul className="iss-comments">
            {shown.map((comment, index) => (
              <li key={`${comment.author}-${comment.minsAgo}-${index}`}>
                <article className="iss-comment">
                  <div className="iss-comment-head">
                    <PersonName name={comment.author} agent={comment.agent} creator={comment.author === issue.reporter} />
                    <span className="iss-comment-time">{formatAge(comment.minsAgo)}</span>
                  </div>
                  <p className="iss-comment-body">{comment.body}</p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function detailOwnerOrYou(detail: IssueDetail): string {
  return detail.owner ?? "You";
}

type ActivityEntry = { key: string; type: string; actor: string; summary: string; when: string };

/** The Activity card's entries, newest first: steering from the run, then the issue's own history. */
function activityFor(issue: Issue, detail: IssueDetail, state: RunState | null): ActivityEntry[] {
  const agent = issue.worker ?? "Agent";
  const steering: ActivityEntry[] = state
    ? state.events
        .filter((e) => e.actor !== "agent" || e.kind === "ack" || e.kind === "ask" || e.kind === "pr" || e.kind === "resolve")
        .map((e) => {
          const when = `run ${formatClock(e.at)}`;
          if (e.actor === "human") return { key: `run-${e.id}`, type: "Steer", actor: "You", summary: e.title.replace(/^You /, ""), when };
          if (e.actor === "system") return { key: `run-${e.id}`, type: "Steer", actor: "Ziki", summary: e.detail ? `${e.title}. ${e.detail}` : e.title, when };
          const summary = e.kind === "ask" ? `asked: ${e.title}` : e.kind === "ack" ? `${e.title} ${e.detail ?? ""}`.trim() : e.title;
          return { key: `run-${e.id}`, type: "Agent", actor: agent, summary, when };
        })
        .reverse()
    : [];
  const history: ActivityEntry[] = [];
  if (issue.status === "resolved" && issue.resolvedBy && !state) {
    history.push({ key: "resolved", type: "Status changed", actor: issue.resolvedBy, summary: "marked this issue resolved", when: formatAge(issue.updatedMinsAgo) });
  }
  const claim = detail.decisions.find((d) => d.kind === "claimed");
  if (claim) history.push({ key: "claimed", type: "Claimed", actor: claim.agent, summary: `claimed this issue for ${claim.person}`, when: formatAge(Math.min(detail.createdMinsAgo - 1, 12)) });
  const confirmed = detail.decisions.filter((d) => d.kind === "confirmed").length;
  if (confirmed) history.push({ key: "confirmed", type: "Confirmed", actor: `${confirmed} ${confirmed === 1 ? "bot" : "bots"}`, summary: "confirmed this issue is real", when: formatAge(detail.createdMinsAgo - 30) });
  history.push({ key: "created", type: "Created", actor: issue.reporter, summary: "reported this issue", when: formatAge(detail.createdMinsAgo) });
  return [...steering, ...history];
}

function ActivityCard({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="iss-card is-rail" aria-label="Activity">
      <details className="iss-activity">
        <summary>
          <span className="iss-activity-head">
            <h2 className="iss-label">Activity ({entries.length})</h2>
            <span aria-hidden="true" className="iss-activity-caret">▸</span>
          </span>
          <p className="iss-hint">Read-only history of changes on this issue.</p>
        </summary>
        <ol className="iss-timeline">
          {entries.map((entry) => (
            <li key={entry.key}>
              <span className="iss-timeline-dot" aria-hidden="true" />
              <div className="iss-timeline-meta">
                <span className="iss-timeline-type">{entry.type}</span>
                <span className="iss-timeline-when">{entry.when}</span>
              </div>
              <div className="iss-timeline-text"><strong>{entry.actor}</strong> {entry.summary}</div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function IssueLayout({
  issue,
  celebrating,
  run,
  demoBar,
}: {
  issue: Issue;
  celebrating: CelebrationPhase | undefined;
  run: { state: RunState; card: React.ReactNode } | null;
  demoBar?: React.ReactNode;
}) {
  const detail = detailFor(issue);
  const activity = activityFor(issue, detail, run?.state ?? null);
  const typeName = issue.type === "security" ? "Security" : issue.type === "feature" ? "Feature" : "Bug";
  const resolved = issue.status === "resolved";
  const resolvedByAgent = resolved && issue.resolvedBy != null && issue.resolvedBy === issue.worker;
  const prOpened = resolvedByAgent || (run?.state.events.some((e) => e.kind === "pr") ?? false);
  const prUrl = `https://github.com/Zedu-Endor/issue-tracker/pull/${issue.number + 8}`;
  const passed = detail.stage === "confirmed" || detail.stage === "ready";
  const flying = celebrating === "flying" ? "flying" : undefined;

  return (
    <div className="iss" data-done={isDone(issue.status) || undefined}>
      {demoBar ? <div className="iss-demo">{demoBar}</div> : null}

      {resolved ? (
        <section aria-label="Resolution note" className="iss-card is-resolution" data-celebrating={flying}>
          <h2>
            Resolved by {issue.resolvedBy ?? "a teammate"}
            <span>{formatAge(issue.updatedMinsAgo)}</span>
          </h2>
          <p>{detail.resolutionNote}</p>
        </section>
      ) : null}

      <div className="iss-head">
        <div className="iss-head-main">
          <div className="iss-title-row">
            <Link href="/issues" aria-label="Back to issues" title="Back to issues" className="iss-back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </Link>
            <h1>
              <span className="iss-number tabular" data-bug-origin={issue.number} data-bug-priority="1">{formatIssueNumber(issue.number)}</span> {issue.title}
            </h1>
          </div>
          {resolvedByAgent ? (
            <div className="iss-agent-resolved">
              <p>
                Resolved by <span className="is-strong">{issue.resolvedBy}</span> because{" "}
                <a href={prUrl} target="_blank" rel="noopener noreferrer">its pull request</a> was merged.
              </p>
              <button type="button" className="iss-button is-secondary" onClick={() => changeStatus(issue.number, "open")}>Reopen</button>
            </div>
          ) : null}
          <p className="iss-chips">
            <span className="iss-chip is-neutral">{typeName}</span>
            <span className="iss-chip is-neutral">{issue.category}</span>
          </p>
        </div>
        <div className="iss-head-actions">
          <VoteControl votes={issue.votes} />
        </div>
      </div>

      <div className="iss-cols">
        <div className="iss-main">
          <section className="iss-card" aria-label="Description">
            <div className="iss-card-head">
              <h2 className="iss-label">Description</h2>
            </div>
            <div className="iss-description">{detail.description}</div>
          </section>

          <AgentDecisionsSummary decisions={detail.decisions} passed={passed} />

          {run ? run.card : null}

          <UpdateStatusCard issue={issue} />

          <MergeDecisionsCard />

          <ConversationCard issue={issue} detail={detail} />
        </div>

        <aside className="iss-side" aria-label="Issue details">
          <section aria-label="Status" className="iss-card is-compact" data-celebrating={flying}>
            <h2 className="iss-label">Status</h2>
            <div className="iss-chips is-status">
              <span className={`iss-chip is-${issue.status}`} data-bug-origin={issue.number} data-bug-priority="0">
                <span className="iss-chip-dot" aria-hidden="true" />
                {statusLabels[issue.status]}
              </span>
              <span className={`iss-chip is-severity-${issue.severity}`}>{severityLabels[issue.severity]}</span>
              {detail.stage ? <span className={`iss-chip is-stage-${detail.stage}`}>{stageLabels[detail.stage]}</span> : null}
              {run && run.state.phase !== "done" ? <PhasePill state={run.state} /> : null}
            </div>
            <p className="iss-hint">Opened {formatAge(detail.createdMinsAgo)} by {issue.reporter}</p>
          </section>

          <section className="iss-card is-compact" aria-label="People">
            <span className="iss-label">People</span>
            <div className="iss-people-row">
              <span className="iss-people-label">Reporter</span>
              <PersonName name={issue.reporter} creator />
            </div>
            <div className="iss-people-row">
              <span className="iss-people-label">Assignee</span>
              {detail.assignee ? <PersonName name={detail.assignee} /> : <span className="iss-muted">Unassigned</span>}
            </div>
            {run && issue.worker && run.state.phase !== "done" ? (
              <div className="iss-people-row">
                <span className="iss-people-label">Working</span>
                <a href="#live" className="iss-working"><BotAvatar name={issue.worker} small /> {issue.worker}</a>
              </div>
            ) : null}
          </section>

          <section className="iss-card is-compact" aria-label="GitHub PR">
            <h2 className="iss-label">GitHub PR</h2>
            {prOpened ? (
              <ul className="iss-pr-list">
                <li>
                  <a href={prUrl} target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                    {prUrl}
                  </a>
                </li>
              </ul>
            ) : (
              <p className="iss-muted is-gap">No GitHub PR attached to this report.</p>
            )}
          </section>

          <ActivityCard entries={activity} />
        </aside>
      </div>
    </div>
  );
}

function RunningIssue({ issue, celebrating, onRestart }: { issue: Issue; celebrating: CelebrationPhase | undefined; onRestart: () => void }) {
  const [initial] = useState<SavedRun>(() => runs.get(issue.number) ?? freshRun(issue.number));
  const { startedAt } = initial;
  const [state, dispatch] = useReducer(runReducer, initial.state);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [viewer, setViewer] = useState<Viewer>("owner");
  const reported = useRef(initial.state.phase === "done");
  const agent = issue.worker ?? "Agent";
  const owner = detailFor(issue).owner ?? "its owner";
  const act = (command: RunCommand) => dispatch({ ...command, at: Date.now() - startedAt } as RunAction);

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

  const demoBar = (
    <div className="demo-bar" role="group" aria-label="Prototype controls">
      <span className="demo-bar-label">Prototype</span>
      <div className="run-speed" role="group" aria-label="Demo speed">
        {(Object.keys(SPEEDS) as Speed[]).map((value) => (
          <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
            {value === "normal" ? "1×" : "2.5×"}
          </button>
        ))}
      </div>
      <div className="run-speed" role="group" aria-label="View as">
        <button type="button" aria-pressed={viewer === "owner"} onClick={() => setViewer("owner")}>As {owner.split(" ")[0]}</button>
        <button type="button" aria-pressed={viewer === "teammate"} onClick={() => setViewer("teammate")}>As a teammate</button>
      </div>
    </div>
  );

  return (
    <IssueLayout
      issue={issue}
      celebrating={celebrating}
      demoBar={demoBar}
      run={{
        state,
        card: (
          <LiveSteerCard
            issue={issue}
            owner={owner}
            state={state}
            startedAt={startedAt}
            canSteer={viewer === "owner"}
            act={act}
            onRestart={onRestart}
          />
        ),
      }}
    />
  );
}

export function IssueRun({ number }: { number: number }) {
  const { issues, celebrating } = useIssuesStore();
  const [runKey, setRunKey] = useState(0);
  // Opening (or reloading) a resolved issue sets its bug free again. Keyed on the
  // number only: a resolve on this page already celebrates through changeStatus.
  useEffect(() => replayResolved(number), [number]);
  const issue = issues.find((item) => item.number === number);
  if (!issue) {
    return (
      <div className="dt">
        <p>That issue isn&apos;t in this prototype. <Link href="/issues">Back to Issues</Link></p>
      </div>
    );
  }
  const phase = celebrating.get(issue.number);
  if (issue.agentRun && (issue.status === "in_progress" || runs.has(issue.number))) {
    return (
      <RunningIssue
        key={runKey}
        issue={issue}
        celebrating={phase}
        onRestart={() => {
          runs.delete(issue.number);
          changeStatus(issue.number, "in_progress");
          setRunKey(runKey + 1);
        }}
      />
    );
  }
  return <IssueLayout issue={issue} celebrating={phase} run={null} />;
}
