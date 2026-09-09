# WATTS

Unified monorepo combining two IEEE-UCF projects with full history preserved.
Each subproject's commits are rooted at its final path, so `git log -- <path>`
shows the complete per-project history.

| Path                | Source repository | Branch merged |
| ------------------- | ----------------- | ------------- |
| `apps/dbot`        | https://github.com/IEEE-UCF/IEEE-UCF-Discord-Bot | `mono-Prep` |
| `apps/ieeeucfcom` | https://github.com/IEEE-UCF/IEEE-Website | `main` |

## Getting started

- [`DEVELOPING.md`](DEVELOPING.md) — run the whole stack locally.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch / commit / PR conventions and the
  migration approval flow.
- [`apps/ieeeucfcom/DEPLOY.md`](apps/ieeeucfcom/DEPLOY.md) — Vercel deployment.
