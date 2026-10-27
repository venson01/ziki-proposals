import type { Issue, Severity } from "./issues";
import { severityLabels } from "./issues";

/**
 * Mock content for the issue page: what the real page reads from Prisma
 * (description, agent decisions, conversation, people), kept apart from the
 * list data.
 */

/** One agent decision, as the real decisions strip shows it. */
export type BotDecision = {
  agent: string;
  kind: "confirmed" | "claimed";
  /** The person the agent acted for. */
  person: string;
  severity?: Severity;
};

export type IssueComment = { author: string; agent?: string; body: string; minsAgo: number };

/** The intake stage chip in the Status box (Reported, Confirmed, Ready). */
export type IssueStage = "reported" | "confirmed" | "ready";

export type IssueDetail = {
  description: string;
  /** The person an agent works for (its owner), when one has the claim. */
  owner: string | null;
  assignee: string | null;
  stage: IssueStage | null;
  createdMinsAgo: number;
  decisions: BotDecision[];
  comments: IssueComment[];
  /** The note shown in the green resolution box once the issue is resolved. */
  resolutionNote: string;
};

export const stageLabels: Record<IssueStage, string> = { reported: "Reported", confirmed: "Confirmed", ready: "Ready" };

/** What a bot said, in a few words, for its card (same wording as the real strip). */
export function shortSaying(decision: BotDecision): string {
  if (decision.kind === "claimed") return `Working on it for ${decision.person}`;
  return decision.severity ? `Confirmed it’s real · ${severityLabels[decision.severity]}` : "Confirmed it’s real";
}

const DETAILS: Record<number, Partial<IssueDetail>> = {
  1432: {
    description:
      "Clicking the vote button twice quickly counts two votes. It happens on slow connections, where the first request hasn't returned before the second click. Expected: one vote per person, however fast they click.",
    owner: "Stephen Okoro",
    assignee: "Stephen Okoro",
    stage: "ready",
    createdMinsAgo: 240,
    decisions: [
      { agent: "Reviewer One", kind: "confirmed", person: "Ada Nwosu", severity: "high" },
      { agent: "Reviewer Two", kind: "confirmed", person: "Tobi Adeyemi", severity: "high" },
      { agent: "Charles Xavier", kind: "claimed", person: "Stephen Okoro" },
    ],
    comments: [
      { author: "Ada Nwosu", body: "Seen this on mobile data too. The count jumps by two, then drops back on refresh.", minsAgo: 180 },
      { author: "Stephen Okoro", agent: "Charles Xavier", body: "Claimed. I'll check whether the vote endpoint is idempotent first.", minsAgo: 12 },
    ],
    resolutionNote: "Votes are now idempotent and the button is disabled while a vote is in flight. Verified by two testers.",
  },
  1429: {
    description:
      "After answering an agent's question from the Inbox, the badge in the header still shows the old count until the page is reloaded.",
    owner: "Stephen Okoro",
    assignee: "Stephen Okoro",
    stage: "ready",
    createdMinsAgo: 360,
    decisions: [
      { agent: "Reviewer One", kind: "confirmed", person: "Ada Nwosu", severity: "medium" },
      { agent: "Reviewer Two", kind: "confirmed", person: "Tobi Adeyemi" },
      { agent: "Stephen (Opus)", kind: "claimed", person: "Stephen Okoro" },
    ],
    comments: [{ author: "Tobi Adeyemi", body: "Happens on both desktop and mobile.", minsAgo: 300 }],
    resolutionNote: "The badge now refreshes when a question is answered.",
  },
  1421: {
    description:
      "Admin merge fails with an error when the project has no GitHub App configured. It should fall back to a plain merge and say so.",
    owner: "Femi Okafor",
    assignee: "Femi Okafor",
    stage: "ready",
    createdMinsAgo: 600,
    decisions: [
      { agent: "Reviewer One", kind: "confirmed", person: "Femi Okafor", severity: "high" },
      { agent: "Mergebot", kind: "claimed", person: "Femi Okafor" },
    ],
    resolutionNote: "Admin merge falls back to a plain merge when the GitHub App isn't configured.",
  },
  1409: {
    description:
      "The leaderboard still counts points earned on issues that were later deleted, so some people rank higher than they should.",
    owner: "Stephen Okoro",
    assignee: "Stephen Okoro",
    stage: "ready",
    createdMinsAgo: 4320,
    decisions: [
      { agent: "Reviewer One", kind: "confirmed", person: "Ada Nwosu", severity: "medium" },
      { agent: "Reviewer Two", kind: "confirmed", person: "Ngozi Eze", severity: "medium" },
      { agent: "Charles Xavier", kind: "claimed", person: "Stephen Okoro" },
    ],
    comments: [
      { author: "Ada Nwosu", body: "Noticed after we cleaned up the duplicate issues last week.", minsAgo: 4000 },
      { author: "Stephen Okoro", agent: "Charles Xavier", body: "Fixed: points from deleted issues are no longer counted. PR is linked.", minsAgo: 1500 },
    ],
    resolutionNote: "Points from deleted issues are no longer counted on the leaderboard. Verified by two testers.",
  },
};

export function detailFor(issue: Issue): IssueDetail {
  const known = DETAILS[issue.number] ?? {};
  const confirmed = issue.votes >= 5;
  return {
    description: known.description ?? `${issue.title}. Reported in ${issue.category}.`,
    owner: known.owner ?? null,
    assignee: known.assignee ?? null,
    stage: known.stage ?? (confirmed ? "confirmed" : "reported"),
    createdMinsAgo: known.createdMinsAgo ?? Math.max(issue.updatedMinsAgo, 120),
    decisions: known.decisions ?? (confirmed ? [{ agent: "Reviewer One", kind: "confirmed", person: issue.reporter, severity: issue.severity }] : []),
    comments: known.comments ?? [],
    resolutionNote: known.resolutionNote ?? "Marked resolved.",
  };
}
