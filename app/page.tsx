import Link from "next/link";
import { BugIcon, SteerIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="home">
      <p className="home-eyebrow">Ziki · HNG15 proposals</p>
      <h1>Two small changes to how Ziki feels to work with</h1>
      <p className="home-lede">
        One makes finishing work feel good. The other lets people steer agents while they work, instead of only judging the result
        at the end. Both are working prototypes built in the Ziki look, with mock data.
      </p>
      <div className="home-cards">
        <Link href="/issues" className="home-card">
          <span className="home-card-icon is-ok" aria-hidden="true"><BugIcon size={22} /></span>
          <span className="home-card-kicker">Proposal 1 · Whimsy</span>
          <span className="home-card-title">The bug flies away</span>
          <span className="home-card-body">
            When an issue becomes Resolved, its bug grows wings and flutters off the Issues list, leaving sparkles behind. It plays
            whether a person or an agent resolves the issue, comes with an Undo, and plays again whenever a resolved issue&apos;s page
            is opened. It stays still for anyone who prefers reduced motion.
          </span>
          <span className="home-card-cta">Open the Issues list →</span>
        </Link>
        <Link href="/issues/1432" className="home-card">
          <span className="home-card-icon" aria-hidden="true"><SteerIcon size={22} /></span>
          <span className="home-card-kicker">Proposal 2 · Human ↔ agent</span>
          <span className="home-card-title">Live steer &amp; pause</span>
          <span className="home-card-body">
            Watch an agent work on an issue step by step, see what it plans to do next, and pause or redirect it. Changes land only at
            checkpoints the agent marks as safe. A redirect that helped can be saved as a project rule, so every agent learns from it.
          </span>
          <span className="home-card-cta">Watch an agent at work →</span>
        </Link>
      </div>
      <p className="home-foot">
        Why these, how they would work in the real app, and the API changes they need: <Link href="/proposal">read the proposal</Link>.
      </p>
    </div>
  );
}
