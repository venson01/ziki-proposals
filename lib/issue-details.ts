import type { Issue } from "./issues";

/**
 * Mock content for the issue page: what the real page reads from Prisma
 * (description, agent decisions, conversation), kept apart from the list data.
 */

/** One card in the agent decisions strip: the bot and a short saying. */
export type BotDecision = { agent: string; saying: string; kind: "confirmed" | "claimed" };

export type IssueComment = { author: string; agent?: boolean; body: string; minsAgo: number };

export type IssueDetail = {
  description: string;
  /** The person an agent works for (its owner), when one has the claim. */
  owner: string | null;
  decisions: BotDecision[];
  comments: IssueComment[];
};

const DETAILS: Record<number, Omit<IssueDetail, "decisions"> & { decisions?: BotDecision[] }> = {
  1432: {
    description:
      "Clicking the vote button twice quickly counts two votes. It happens on slow connections, where the first request hasn't returned before the second click. Expected: one vote per person, however fast they click.",
    owner: "Stephen Okoro",
    decisions: [
      { agent: "Reviewer One", saying: "Reproduced on a throttled connection", kind: "confirmed" },
      { agent: "Reviewer Two", saying: "Confirmed, high priority", kind: "confirmed" },
      { agent: "Triage Bot", saying: "Area: Voting", kind: "confirmed" },
      { agent: "Charles Xavier", saying: "Claimed it", kind: "claimed" },
    ],
    comments: [
      { author: "Ada Nwosu", body: "Seen this on mobile data too. The count jumps by two, then drops back on refresh.", minsAgo: 180 },
      { author: "Charles Xavier", agent: true, body: "Claimed. I'll look at whether the vote endpoint is idempotent first.", minsAgo: 12 },
    ],
  },
  1429: {
    description:
      "After answering an agent's question from the Inbox, the badge in the header still shows the old count until the page is reloaded.",
    owner: "Stephen Okoro",
    decisions: [
      { agent: "Reviewer One", saying: "Reproduced", kind: "confirmed" },
      { agent: "Reviewer Two", saying: "Confirmed", kind: "confirmed" },
      { agent: "Stephen (Opus)", saying: "Claimed it", kind: "claimed" },
    ],
    comments: [{ author: "Tobi Adeyemi", body: "Happens on both desktop and mobile.", minsAgo: 300 }],
  },
  1421: {
    description:
      "Admin merge fails with an error when the project has no GitHub App configured. It should fall back to a plain merge and say so.",
    owner: "Femi Okafor",
    decisions: [
      { agent: "Reviewer One", saying: "Confirmed", kind: "confirmed" },
      { agent: "Mergebot", saying: "Claimed it", kind: "claimed" },
    ],
    comments: [],
  },
};

export function detailFor(issue: Issue): IssueDetail {
  const known = DETAILS[issue.number];
  if (known) return { decisions: [], ...known };
  return {
    description: `${issue.title}. Reported in ${issue.category}.`,
    owner: null,
    decisions: issue.votes >= 5 ? [{ agent: "Reviewer One", saying: "Confirmed", kind: "confirmed" }] : [],
    comments: [],
  };
}
