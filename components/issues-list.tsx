"use client";

import Link from "next/link";
import { useState } from "react";
import {
  STATUSES,
  TABS,
  formatAge,
  formatIssueNumber,
  inTab,
  isDone,
  severityBars,
  severityLabels,
  statusLabels,
  tabCounts,
  type Issue,
  type Status,
  type Tab,
} from "@/lib/issues";
import { changeStatus, resetDemo, useIssuesStore, type CelebrationPhase } from "@/lib/store";
import { BotIcon, ChevronUpIcon, CheckIcon, CommentIcon, HammeringIcon, TypeIcon } from "@/components/icons";

/** Where an issue stands, in the row's status column. */
export function RowStatus({ issue }: { issue: Issue }) {
  if (isDone(issue.status)) {
    return (
      <span className={`issue-row-status ${issue.status === "resolved" ? "is-resolved" : "is-closed"}`}>
        <CheckIcon size={12} /> {statusLabels[issue.status]}
      </span>
    );
  }
  if (issue.status === "in_progress" && issue.worker) {
    return (
      <span className="issue-row-status is-working">
        <span className="zk-ok"><HammeringIcon /></span>
        <span className="issue-row-worker">{issue.worker}</span>
        <span className="sr-only">is working on it</span>
      </span>
    );
  }
  if (issue.status === "in_progress") return <span className="issue-row-status">In progress</span>;
  return <span className="issue-row-status">Open</span>;
}

function IssueRow({ issue, phase, last }: { issue: Issue; phase: CelebrationPhase | undefined; last: boolean }) {
  const label = `${formatIssueNumber(issue.number)} ${issue.title}`;
  const typeName = issue.type === "security" ? "Security" : issue.type === "feature" ? "Feature" : "Bug";
  return (
    <li
      className={`issues-row${last ? "" : " has-rule"}`}
      data-severity={issue.severity}
      data-celebrating={phase}
      data-done={isDone(issue.status) || undefined}
    >
      <span className="issues-vote" title={`${issue.votes} upvotes`}>
        <ChevronUpIcon size={14} />
        <span className="tabular">{issue.votes}</span>
        <span className="sr-only">upvotes</span>
      </span>
      <Link href={`/issues/${issue.number}`} className="issues-row-link">
        <span className={`issues-type-disc is-${issue.type}`} data-bug-origin={issue.number} aria-hidden="true">
          <span className="issues-type-icon"><TypeIcon type={issue.type} /></span>
          <span className="issues-type-done"><CheckIcon size={16} /></span>
        </span>
        <span className="issues-row-text">
          <span className="issues-row-title">{issue.title}</span>
          <span className="issues-row-meta">
            <span className="mono tabular">{formatIssueNumber(issue.number)}</span>
            <span className="inline-icon" title={typeName}>
              <TypeIcon type={issue.type} size={12} />
              <span className="sr-only">{typeName}</span>
            </span>
            {issue.comments > 0 ? (
              <span className="inline-icon" title={`Conversation: ${issue.comments}`}>
                <CommentIcon size={12} /> {issue.comments}
              </span>
            ) : null}
            <span>{issue.category}</span>
            <span>{formatAge(issue.updatedMinsAgo)}</span>
            <span className="issues-meta-status"><RowStatus issue={issue} /></span>
          </span>
        </span>
      </Link>
      <span className="issues-status-cell">
        <RowStatus issue={issue} />
        {issue.agentRun && issue.status === "in_progress" ? (
          <Link href={`/issues/${issue.number}#live`} className="issues-watch">Watch &amp; steer</Link>
        ) : null}
      </span>
      <span className="issues-priority" title={`${severityLabels[issue.severity]} priority`}>
        <span className="sr-only">{severityLabels[issue.severity]} priority</span>
        <span className="issues-priority-bars" aria-hidden="true">
          {[0, 1, 2].map((bar) => (
            <i key={bar} data-active={bar < severityBars[issue.severity]} />
          ))}
        </span>
      </span>
      <label className="issues-status-select">
        <span className="sr-only">Status for {label}</span>
        <select value={issue.status} onChange={(event) => changeStatus(issue.number, event.target.value as Status)}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

export function IssuesList() {
  const { issues, celebrating } = useIssuesStore();
  const [tab, setTab] = useState<Tab>("open");
  const counts = tabCounts(issues);
  // A row that was just resolved stays put while its bug flies off, then folds away.
  const rows = issues.filter((issue) => inTab(issue, tab) || celebrating.has(issue.number));
  const working = rows.find((issue) => issue.status === "in_progress" && issue.worker);

  return (
    <section className="issues-page" aria-labelledby="issues-heading">
      <div className="issues-heading">
        <div className="issues-breadcrumb">
          <span className="muted">Ziki</span>
          <span className="muted" aria-hidden="true">/</span>
          <h1 id="issues-heading">Issues</h1>
        </div>
        <div className="issues-actions">
          <button
            type="button"
            className="zk-button"
            disabled={!working}
            onClick={() => working && changeStatus(working.number, "resolved", working.worker ?? "an agent")}
            title={working ? `${working.worker} resolves ${formatIssueNumber(working.number)}` : "No agent is working on an issue in this tab"}
          >
            <BotIcon size={14} /> Let an agent resolve one
          </button>
          <button type="button" className="zk-button is-quiet" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
      </div>

      <p className="issues-hint">
        Try it: set any issue to <strong>Resolved</strong> with the status menu on its row, or let an agent do it.
      </p>

      <nav className="issues-status-nav" aria-label="Filter by status">
        <ul>
          {TABS.map((item) => (
            <li key={item.value}>
              <button type="button" aria-pressed={tab === item.value} onClick={() => setTab(item.value)}>
                <span className={`issues-status-dot is-${item.value}`} aria-hidden="true" />
                {item.label}
                <span className="issues-status-count tabular">{counts[item.value]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="issues-table">
        <div className="issues-table-heading" aria-hidden="true">
          <span className="issues-vote-heading">Votes</span>
          <span className="issues-title-heading">Issue</span>
          <span className="issues-status-cell">Status</span>
          <span className="issues-priority">Priority</span>
          <span className="issues-status-select-heading">Set status</span>
        </div>
        {rows.length === 0 ? (
          <p className="issues-empty">Nothing here. Every bug in this tab has flown off.</p>
        ) : (
          <ul aria-label="Issues">
            {rows.map((issue, index) => {
              const phase = celebrating.get(issue.number);
              // Only fold the row away when it no longer belongs in this tab.
              const shown = phase === "leaving" && inTab(issue, tab) ? undefined : phase;
              return <IssueRow key={issue.number} issue={issue} phase={shown} last={index === rows.length - 1} />;
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
