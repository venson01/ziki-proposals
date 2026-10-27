/**
 * Mock data and pure helpers for the Issues list replica. Mirrors the shapes
 * the real list uses (status, severity, issue type, votes) without Prisma.
 */

export type Status = "open" | "in_progress" | "resolved" | "closed";
export type Severity = "low" | "medium" | "high" | "critical";
export type IssueType = "bug" | "feature" | "security";

export type Issue = {
  number: number;
  title: string;
  status: Status;
  severity: Severity;
  type: IssueType;
  votes: number;
  comments: number;
  category: string;
  reporter: string;
  /** Who is working on it: an agent name, or null when nobody has claimed it. */
  worker: string | null;
  /** True when the worker is an agent whose run can be watched and steered. */
  agentRun: boolean;
  /** Minutes since the last update, for the "2h ago" label. */
  updatedMinsAgo: number;
  /** Who resolved it (a person or an agent), for the issue page's resolution note. */
  resolvedBy?: string | null;
};

export const STATUSES: Status[] = ["open", "in_progress", "resolved", "closed"];

export const statusLabels: Record<Status, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const severityLabels: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** How many of the three priority bars light up. */
export const severityBars: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 3 };

export type Tab = "open" | "in_progress" | "done" | "all";

export const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

export function isDone(status: Status): status is "resolved" | "closed" {
  return status === "resolved" || status === "closed";
}

export function inTab(issue: Pick<Issue, "status">, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "done") return isDone(issue.status);
  return issue.status === tab;
}

export function tabCounts(issues: Pick<Issue, "status">[]): Record<Tab, number> {
  const counts: Record<Tab, number> = { open: 0, in_progress: 0, done: 0, all: issues.length };
  for (const issue of issues) {
    if (isDone(issue.status)) counts.done += 1;
    else counts[issue.status] += 1;
  }
  return counts;
}

export function formatIssueNumber(n: number): string {
  return `#${n}`;
}

/** "just now", "12m ago", "3h ago", "2d ago". */
export function formatAge(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Sets an issue's status. Returns the same array when nothing changed, and
 * reports whether this change is the moment worth celebrating: going from
 * anything else to resolved.
 */
export function setStatus(
  issues: Issue[],
  number: number,
  status: Status,
  by: string | null = null,
): { issues: Issue[]; celebrate: boolean } {
  const current = issues.find((issue) => issue.number === number);
  if (!current || current.status === status) return { issues, celebrate: false };
  const resolvedBy = status === "resolved" ? by : null;
  return {
    issues: issues.map((issue) =>
      issue.number === number ? { ...issue, status, updatedMinsAgo: 0, resolvedBy } : issue,
    ),
    celebrate: status === "resolved",
  };
}

/** Light-hearted lines for the resolve announcement, picked in turn. */
export const RESOLVE_QUIPS = [
  "Bug released back into the wild.",
  "One less bug. It seemed happy to go.",
  "Shoo, bug. Shoo.",
  "That bug has places to be.",
  "Fixed, verified, and fluttering off.",
];

export function resolveQuip(number: number): string {
  return RESOLVE_QUIPS[number % RESOLVE_QUIPS.length];
}

export const SEED_ISSUES: Issue[] = [
  {
    number: 1432,
    title: "Vote button double-counts when clicked twice quickly",
    status: "in_progress",
    severity: "high",
    type: "bug",
    votes: 14,
    comments: 6,
    category: "Voting",
    reporter: "Ada Nwosu",
    worker: "Charles Xavier",
    agentRun: true,
    updatedMinsAgo: 4,
  },
  {
    number: 1429,
    title: "Inbox badge doesn't clear after answering an agent question",
    status: "in_progress",
    severity: "medium",
    type: "bug",
    votes: 9,
    comments: 3,
    category: "Inbox",
    reporter: "Tobi Adeyemi",
    worker: "Stephen (Opus)",
    agentRun: true,
    updatedMinsAgo: 18,
  },
  {
    number: 1427,
    title: "Dark mode: milestone progress bar is invisible on the dashboard",
    status: "open",
    severity: "low",
    type: "bug",
    votes: 5,
    comments: 1,
    category: "Theme",
    reporter: "Ngozi Eze",
    worker: null,
    agentRun: false,
    updatedMinsAgo: 46,
  },
  {
    number: 1425,
    title: "Session expires while writing a long comment and the draft is lost",
    status: "open",
    severity: "critical",
    type: "bug",
    votes: 22,
    comments: 11,
    category: "Auth",
    reporter: "Kemi Balogun",
    worker: null,
    agentRun: false,
    updatedMinsAgo: 95,
  },
  {
    number: 1421,
    title: "Allow admin merge when the GitHub App isn't configured",
    status: "in_progress",
    severity: "high",
    type: "feature",
    votes: 8,
    comments: 4,
    category: "Pipeline",
    reporter: "Femi Okafor",
    worker: "Mergebot",
    agentRun: true,
    updatedMinsAgo: 130,
  },
  {
    number: 1418,
    title: "Rate limiter lets an agent key exceed 60 req/min on burst",
    status: "open",
    severity: "high",
    type: "security",
    votes: 12,
    comments: 2,
    category: "API",
    reporter: "Amara Obi",
    worker: null,
    agentRun: false,
    updatedMinsAgo: 210,
  },
  {
    number: 1413,
    title: "Search snippet cuts a word in half at the ellipsis",
    status: "open",
    severity: "low",
    type: "bug",
    votes: 3,
    comments: 0,
    category: "Search",
    reporter: "Chidi Umeh",
    worker: null,
    agentRun: false,
    updatedMinsAgo: 340,
  },
  {
    number: 1409,
    title: "Leaderboard shows points from deleted issues",
    status: "resolved",
    severity: "medium",
    type: "bug",
    votes: 7,
    comments: 5,
    category: "Points",
    reporter: "Ada Nwosu",
    worker: "Charles Xavier",
    agentRun: false,
    updatedMinsAgo: 1440,
    resolvedBy: "Charles Xavier",
  },
  {
    number: 1402,
    title: "Keyboard shortcut G then I should open the Inbox",
    status: "closed",
    severity: "low",
    type: "feature",
    votes: 2,
    comments: 1,
    category: "Shortcuts",
    reporter: "Tobi Adeyemi",
    worker: null,
    agentRun: false,
    updatedMinsAgo: 4320,
  },
];
