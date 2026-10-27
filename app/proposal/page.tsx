import Link from "next/link";

export const metadata = { title: "Proposal" };

function Code({ children }: { children: React.ReactNode }) {
  return <pre className="doc-code"><code>{children}</code></pre>;
}

export default function ProposalPage() {
  return (
    <article className="doc">
      <p className="home-eyebrow">Proposal</p>
      <h1>Whimsy on resolve, and Live steer &amp; pause</h1>
      <p className="doc-lede">
        Two changes to Ziki. Both prototypes are working, so you can try them: <Link href="/issues">the Issues list</Link> and{" "}
        <Link href="/issues/1432">an agent at work on #1432</Link>.
      </p>

      <nav className="doc-toc" aria-label="On this page">
        <a href="#whimsy">1. The bug flies away</a>
        <a href="#steer">2. Live steer &amp; pause</a>
        <a href="#rollout">3. Rollout and measures</a>
      </nav>

      <section id="whimsy">
        <h2>1. The bug flies away</h2>
        <h3>Why</h3>
        <p>
          Resolving an issue is the moment Ziki pays off: a reporter&apos;s problem is gone, and an agent or a person earns points. Today that
          moment is a quiet check mark, and on the Open tab the row just disappears, which reads more like an error than a win. A short,
          on-brand celebration marks the moment and shows where the issue went.
        </p>
        <h3>What happens</h3>
        <ul>
          <li>The row&apos;s bug icon grows wings, hops, and flutters up off the screen with a trail of sparkles. The empty icon disc turns green with a check mark.</li>
          <li>The row washes green and its status changes to <em>Resolved</em>. If the row no longer fits the current tab, it folds away once the bug has gone.</li>
          <li>A toast says who resolved the issue, adds a light line (“Bug released back into the wild.”), and offers <strong>Undo</strong> for about six seconds.</li>
          <li>Opening or reloading a resolved issue&apos;s page plays the flight again from the header, as a small reminder of the win. Nothing changed, so there&apos;s no toast.</li>
        </ul>
        <h3>Rules</h3>
        <ul>
          <li><strong>Only for resolved issues.</strong> It plays when an issue goes from any status to <code>resolved</code>, once per change, and when someone opens a resolved issue&apos;s page. Never for <code>closed</code>, and never when a list loads.</li>
          <li><strong>The same for people and agents.</strong> Most issues in Ziki are resolved by agents, so their wins get celebrated too.</li>
          <li><strong>Reduced motion respected.</strong> With <code>prefers-reduced-motion</code> on, nothing flies. The check mark and the toast still appear.</li>
          <li><strong>Never in the way.</strong> The bug sits in a layer that ignores the pointer, moves only by transform, and is removed after about 2.8 seconds. The page underneath doesn&apos;t re-render.</li>
          <li><strong>Accessible.</strong> The toast is a polite live region, so screen readers hear what changed.</li>
        </ul>
        <h3>Bringing it to the real app</h3>
        <p>
          The real Issues list is rendered on the server. Two triggers would cover every case. After the status server action returns, the
          client launches the flight from that row. For changes made elsewhere, mostly by agents, the list listens on{" "}
          <code>GET /api/v1/events/stream</code> for status changes and launches it for any row on screen. A <em>Celebrations</em> switch
          under Settings › Appearance lets people turn it off.
        </p>
      </section>

      <section id="steer">
        <h2>2. Live steer &amp; pause</h2>
        <h3>The gap</h3>
        <p>
          Today people meet an agent&apos;s work at two points: before it starts (bids, offers, accepting) and after it finishes (merger review:{" "}
          <code>submitted</code> → <code>ready_to_merge</code> or <code>rejected</code>). In between, an agent can ask a person a question
          through the Inbox, but a person can&apos;t tell the agent anything. When an agent heads the wrong way, such as a schema change nobody
          wanted or a scope that keeps growing, nobody finds out until review. Then the work is rejected and redone, which costs time,
          claims and points.
        </p>
        <h3>The idea</h3>
        <p>Let people steer agents while they work, without micromanaging them and without breaking anything halfway through.</p>
        <ol>
          <li><strong>Agents narrate.</strong> Each step is posted as it happens, together with what the agent plans to do next. The remaining plan is visible, with tags such as <em>optional</em> or <em>touches schema</em>, so people can spot trouble early.</li>
          <li><strong>Agents mark checkpoints.</strong> A checkpoint is a step after which stopping is safe: tests are green and no file is half-written.</li>
          <li><strong>People pause or redirect.</strong> One click to <em>Pause</em>. <em>Redirect</em> offers one-tap options (<em>Write a failing test first</em>, <em>Smaller scope</em>, <em>Don&apos;t touch the schema</em>, <em>Reuse what exists</em>) plus a free-text note. Both take effect at the next checkpoint, and the UI says which one.</li>
          <li><strong>Agents acknowledge.</strong> The agent replies on the timeline, for example “Got it. Dropped 1 optional step: …”, and the plan updates where people can see it. Nothing changes silently.</li>
          <li><strong>Lessons stick.</strong> After the run, any redirect that helped can be saved as a project rule in the existing Mistake Registry, so every later agent reads it before starting.</li>
        </ol>

        <h3 id="where-it-fits">Where it fits in Ziki today</h3>
        <p>
          Live steer covers step 4 of the lifecycle, <em>Keep the claim and deliver a fix</em>: from the moment an offer is accepted until the
          agent submits its PR. People already take part in confirming an issue (step 2), accepting an offer (step 3) and checking the result
          (steps 5–7). Step 4 is the only stretch where they can&apos;t reach the agent. Live steer needs no new page; it fits into parts of Ziki
          that already exist.
        </p>
        <h4>On screen</h4>
        <ul>
          <li>
            <strong>Issue page (<code>/issues/{"{n}"}</code>).</strong> The Live steer panel goes in the main column, directly below the agent
            decisions summary and above the status form, next to the agent&apos;s questions (escalations). It shows only while a claim is
            active. Questions are agents asking people; steering is people directing agents, so the two belong side by side.
          </li>
          <li>
            <strong>Issues list.</strong> An in-progress row already shows a tapping hammer, the agent&apos;s name and how long it has been
            working. That status cell gains a <em>Watch &amp; steer</em> link to the panel.
          </li>
          <li>
            <strong>Inbox.</strong> A run that is paused and waiting for a redirect joins <em>Need your input</em>, alongside agent questions,
            so the person who paused it doesn&apos;t forget it.
          </li>
          <li>
            <strong>Activity timeline.</strong> Every pause, redirect and agent acknowledgement becomes an entry in the issue&apos;s activity
            sidebar, so the history stays with the issue.
          </li>
        </ul>
        <h4>Behind the scenes</h4>
        <ul>
          <li>
            <strong>Claim heartbeat</strong> (<code>POST /api/v1/issues/{"{id}"}/heartbeat</code>). Agents holding a claim already call it.
            Its reply can also deliver waiting steering. Heartbeats default to every 15 minutes, which is too slow on its own, so checkpoint
            steps (below) are the main channel and the heartbeat is the fallback.
          </li>
          <li>
            <strong>Event stream</strong> (<code>GET /api/v1/events/stream</code>). Pushes steps, pauses, redirects and acknowledgements to
            everyone watching the issue page.
          </li>
          <li>
            <strong>Claim deadline</strong> (<code>POST /api/v1/issues/{"{id}"}/extend</code>). Ziki already manages how long a claim lasts.
            Pausing stops that clock and resuming restarts it.
          </li>
          <li>
            <strong>Mistake Registry</strong> (<code>POST /api/v1/projects/{"{id}"}/mistakes</code>). <em>Save as project rule</em> writes
            here, and agents already read the registry (<code>GET</code>) before starting work.
          </li>
        </ul>
        <p>The only new data is the run&apos;s steps and the steer requests, both attached to the existing claim.</p>

        <h3>API sketch</h3>
        <p>Additive changes to the agent API, following the conventions in <code>docs/ziki-for-agents.md</code>.</p>
        <Code>{`# Agent posts a step (and its next intent)
POST /api/v1/issues/{id}/run/steps
{ "kind": "edit", "title": "Disable the vote button while in flight",
  "detail": "components/vote-button.tsx", "checkpoint": true,
  "next": "Run pnpm test" }

# The response carries any steering waiting for the agent: no extra polling
200 { "steer": [{ "id": "st_91", "action": "redirect",
                  "preset": "no_schema", "note": "", "by": "Ada Nwosu" }] }

# The existing claim heartbeat carries it too, for agents between checkpoints
POST /api/v1/issues/{id}/heartbeat  →  200 { "claim": { ... }, "steer": [ ... ] }

# Agent acknowledges and says how its plan changed
POST /api/v1/issues/{id}/steer/{steerId}/ack
{ "summary": "Removed the schema change; will use an upsert instead." }

# A person steers (reporter, project admins, or the claim's owner)
POST /api/v1/issues/{id}/steer
{ "action": "pause" | "resume" | "redirect", "preset"?: "...", "note"?: "..." }

# Everyone watching sees it live
GET /api/v1/events/stream  →  run.step, steer.requested, steer.acknowledged`}</Code>
        <p>
          MCP gets matching tools (<code>ziki_post_step</code>, <code>ziki_ack_steer</code>), and the agent protocol gains one rule:{" "}
          <em>at every checkpoint, act on pending steering before taking your next step.</em>
        </p>

        <h3>Fairness and safety</h3>
        <ul>
          <li><strong>Paused time doesn&apos;t count against the agent.</strong> The claim deadline stops while an agent is paused, so a pause never costs it the claim or points.</li>
          <li><strong>A pause can&apos;t hold an issue hostage.</strong> After 30 minutes paused with no redirect, the owner is reminded. After 2 hours, the claim goes back to the queue.</li>
          <li><strong>Steering can&apos;t skip the gates.</strong> A redirect changes the agent&apos;s plan. Two testers, merger review and the human review gate still apply.</li>
          <li><strong>Who can steer.</strong> The reporter, project admins, and the person who owns the agent. Every action goes in the audit log and is rate-limited.</li>
          <li><strong>Agents that don&apos;t support it keep working.</strong> Unacknowledged steering appears as a warning to the person, not as a silent failure.</li>
        </ul>
      </section>

      <section id="rollout">
        <h2>3. Rollout and measures</h2>
        <ol>
          <li><strong>Watch.</strong> Agents post steps and a read-only live timeline appears on the issue page. Nothing changes for agents that don&apos;t post steps.</li>
          <li><strong>Pause.</strong> Add pause and resume at checkpoints, with the claim deadline stopped while paused.</li>
          <li><strong>Redirect and rules.</strong> Add one-tap redirects, acknowledgements, and saving redirects to the Mistake Registry.</li>
        </ol>
        <p>We would know it works if:</p>
        <ul>
          <li>Fewer agent PRs are <code>rejected</code> at merger review, the main target.</li>
          <li>Rework time from claim to resolved goes down on issues that were steered.</li>
          <li>Steered runs reach <code>ready_to_merge</code> more often than similar unsteered runs.</li>
          <li>The Mistake Registry grows from saved redirects, and the same redirect is needed less often over time.</li>
        </ul>
        <p className="muted">
          For whimsy, the guardrail is the share of people who turn Celebrations off. If it goes above about 10%, tone it down.
        </p>
      </section>
    </article>
  );
}
