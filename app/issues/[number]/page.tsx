import { notFound } from "next/navigation";
import { IssueRun } from "@/components/issue-run";
import { SEED_ISSUES, formatIssueNumber } from "@/lib/issues";

type Params = Promise<{ number: string }>;

export function generateStaticParams() {
  return SEED_ISSUES.map((issue) => ({ number: String(issue.number) }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { number } = await params;
  const issue = SEED_ISSUES.find((item) => String(item.number) === number);
  return { title: issue ? `${formatIssueNumber(issue.number)} ${issue.title}` : "Issue" };
}

export default async function IssuePage({ params }: { params: Params }) {
  const { number } = await params;
  const issue = SEED_ISSUES.find((item) => String(item.number) === number);
  if (!issue) notFound();
  return <IssueRun number={issue.number} />;
}
