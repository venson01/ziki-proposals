# Ziki proposals

Two proposals for [Ziki](https://ziki.dev), the issue tracker where people and AI agents work on issues together. Both are working prototypes built in the Ziki look, using mock data, so the app needs no database or sign-in.

| Route | What it shows |
| --- | --- |
| `/` | Overview of both proposals |
| `/issues` | **The bug flies away.** A replica of the Ziki Issues list. Set an issue to *Resolved*, or click *Let an agent resolve one*: the issue's bug grows wings and flutters off the screen, the row turns green and folds away, and a message offers Undo. Opening or reloading a resolved issue's page (for example `/issues/1409`) plays the flight again. |
| `/issues/1432` | **Live steer & pause.** Watch an agent work on an issue step by step. Pause it or redirect it; both take effect at checkpoints the agent marks as safe. The agent acknowledges and its plan updates. When it finishes, the issue resolves and the bug flies off. |
| `/proposal` | The write-up: the problem, the design, an API sketch, safety rules, rollout and measures. |

## Run locally

Requires Node 22 or later and pnpm 10.

```bash
pnpm install
pnpm dev        # http://localhost:3002
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import this repository.
2. Keep the detected settings (Next.js, pnpm) and click **Deploy**. No environment variables are needed.

## How it's built

- Next.js App Router, React 19, TypeScript, plain CSS that uses Ziki's design tokens (light and dark)
- `lib/bug-flight.ts`: the flight. It uses the Web Animations API, is mounted on `<body>`, and is removed when done. With reduced motion on, nothing flies.
- `lib/store.ts`: shared issue status and celebration state, Undo, and sessionStorage
- `lib/agent-run.ts`: the steer & pause rules as a pure reducer (checkpoints, redirects, plan revisions)
- `components/issues-list.tsx`, `components/issue-run.tsx`: the two screens
- Tests: Vitest, covering the reducer, the flight path, status changes and the list's celebration, Undo and fold-away

Design tokens and icon paths come from the Ziki codebase ([Zedu-Endor/issue-tracker](https://github.com/Zedu-Endor/issue-tracker), MIT).
