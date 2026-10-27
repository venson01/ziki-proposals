"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
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
import { detailFor, type BotDecision, type IssueDetail } from "@/lib/issue-details";
import { changeStatus, replayResolved, useIssuesStore, type CelebrationPhase } from "@/lib/store";
import {
  BotIcon,
  CheckIcon,
  ChevronUpIcon,
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
  TypeIcon,
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

function BotAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className="dt-bot" style={{ width: size, height: size }} aria-hidden="true" title={name}>
      <BotIcon size={Math.round(size / 2)} />
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
    <section id="live" className="dt-card ls" data-phase={state.phase} aria-labelledby="ls-heading">
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
        <h3 className="dt-label">Recent steps</h3>
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

/** Agent decisions at a glance, like the real strip: a count tile and a card per bot. */
function DecisionsStrip({ decisions }: { decisions: BotDecision[] }) {
  if (decisions.length === 0) return null;
  const confirmations = decisions.filter((d) => d.kind === "confirmed").length;
  return (
    <section aria-label="Agent decisions" className="dt-card dt-decisions">
      <div className={`dt-decisions-count${confirmations >= 2 ? " is-passed" : ""}`}>
        <strong className="tabular">{decisions.length}</strong>
        <span>{decisions.length === 1 ? "bot" : "bots"}</span>
      </div>
      <ul>
        {decisions.map((decision) => (
          <li key={`${decision.agent}-${decision.kind}`} className="dt-bot-card">
            <BotAvatar name={decision.agent} size={32} />
            <span>
              <span className="dt-bot-name">{decision.agent}</span>
              <span className="dt-bot-saying">“{decision.saying}”</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ActivityItem = { key: string; icon: React.ReactNode; text: string; when: string; human?: boolean };

/** The Activity box: steer events from the run, newest first, then the issue's history. */
function activityFor(issue: Issue, detail: IssueDetail, state: RunState | null): ActivityItem[] {
  const steering: ActivityItem[] = state
    ? state.events
        .filter((e) => e.actor !== "agent" || e.kind === "ack" || e.kind === "ask" || e.kind === "resolve")
        .map((e) => {
          const Icon = e.actor === "human" ? UserIcon : EVENT_ICONS[e.kind];
          const text = e.kind === "ask" ? `${issue.worker} asked a question` : e.kind === "ack" ? `${issue.worker}: ${e.title}` : e.title;
          return { key: `run-${e.id}`, icon: <Icon size={12} />, text, when: `run ${formatClock(e.at)}`, human: e.actor === "human" };
        })
        .reverse()
    : [];
  const history: ActivityItem[] = [];
  if (state && issue.worker) history.push({ key: "claimed", icon: <BotIcon size={12} />, text: `${issue.worker} claimed it for ${detail.owner ?? "its owner"}`, when: "12m ago" });
  const confirmed = detail.decisions.filter((d) => d.kind === "confirmed").length;
  if (confirmed) history.push({ key: "confirmed", icon: <CheckIcon size={12} />, text: `Confirmed by ${confirmed} ${confirmed === 1 ? "bot" : "bots"}`, when: "2h ago" });
  history.push({ key: "reported", icon: <UserIcon size={12} />, text: `Reported by ${issue.reporter}`, when: formatAge(Math.max(issue.updatedMinsAgo, 240)) });
  return [...steering, ...history];
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
  return (
    <div className="dt">
      <div className="dt-top">
        <Link href="/issues" className="dt-back">← Issues</Link>
        {demoBar}
      </div>

      <header className="dt-head" data-celebrating={celebrating === "flying" ? "flying" : undefined} data-done={isDone(issue.status) || undefined}>
        <div className="dt-head-main">
          <div className="dt-title-row">
            <span className={`issues-type-disc is-${issue.type} is-large`} data-bug-origin={issue.number} aria-hidden="true">
              <span className="issues-type-icon"><TypeIcon type={issue.type} size={20} /></span>
              <span className="issues-type-done"><CheckIcon size={20} /></span>
            </span>
            <h1>
              <span className="dt-num tabular">{formatIssueNumber(issue.number)}</span> {issue.title}
            </h1>
          </div>
          <p className="dt-chips">
            <span className="dt-chip">{typeName}</span>
            <span className="dt-chip">{issue.category}</span>
            <span className="dt-chip">{severityLabels[issue.severity]} priority</span>
          </p>
        </div>
        <span className="issues-vote dt-vote" title={`${issue.votes} upvotes`}>
          <ChevronUpIcon size={14} />
          <span className="tabular">{issue.votes}</span>
          <span className="sr-only">upvotes</span>
        </span>
      </header>

      <div className="dt-cols">
        <div className="dt-main">
          <section className="dt-card" aria-labelledby="dt-description">
            <h2 id="dt-description" className="dt-label">Description</h2>
            <p className="dt-body">{detail.description}</p>
          </section>

          <DecisionsStrip decisions={detail.decisions} />

          {run ? run.card : (
            <p className="dt-hint">
              {isDone(issue.status) ? "This issue is done; no agent is working on it." : "No agent has claimed this issue yet, so there's nothing to steer."}{" "}
              Try <Link href="/issues/1432#live">#1432</Link> to see Live steer &amp; pause.
            </p>
          )}

          <section className="dt-card" aria-labelledby="dt-conversation">
            <h2 id="dt-conversation" className="dt-label">Conversation {detail.comments.length ? `(${detail.comments.length})` : ""}</h2>
            {detail.comments.length === 0 ? (
              <p className="muted dt-body">No comments yet.</p>
            ) : (
              <ul className="dt-comments">
                {detail.comments.map((comment) => (
                  <li key={`${comment.author}-${comment.minsAgo}`}>
                    {comment.agent ? <BotAvatar name={comment.author} size={28} /> : <span className="dt-person" aria-hidden="true">{comment.author[0]}</span>}
                    <div>
                      <p className="dt-comment-meta"><strong>{comment.author}</strong> · {formatAge(comment.minsAgo)}</p>
                      <p className="dt-body">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="dt-side" aria-label="Issue details">
          <section className="dt-card is-compact" aria-labelledby="dt-status">
            <h2 id="dt-status" className="dt-label">Status</h2>
            <div className="dt-status-row">
              <span className={`dt-status-chip is-${issue.status}`}>{statusLabels[issue.status]}</span>
              {run && run.state.phase !== "done" ? <PhasePill state={run.state} /> : null}
            </div>
            <label className="issues-status-select is-detail">
              <span className="sr-only">Change status</span>
              <select value={issue.status} onChange={(event) => changeStatus(issue.number, event.target.value as Status)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="dt-card is-compact" aria-labelledby="dt-people">
            <h2 id="dt-people" className="dt-label">People</h2>
            <dl className="dt-people">
              <div><dt>Reporter</dt><dd>{issue.reporter}</dd></div>
              {run && issue.worker ? (
                <div><dt>Working</dt><dd><a href="#live">{issue.worker}</a> <span className="muted">for {detail.owner ?? "its owner"}</span></dd></div>
              ) : null}
            </dl>
          </section>

          <section className="dt-card is-compact" aria-labelledby="dt-activity">
            <h2 id="dt-activity" className="dt-label">Activity</h2>
            <ol className="dt-activity">
              {activity.map((item) => (
                <li key={item.key} className={item.human ? "is-human" : undefined}>
                  <span className="dt-activity-icon" aria-hidden="true">{item.icon}</span>
                  <span className="dt-activity-text">{item.text}</span>
                  <span className="dt-activity-when">{item.when}</span>
                </li>
              ))}
            </ol>
          </section>
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
