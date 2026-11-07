# MedVisit

Front-desk scheduling for the clinic's imaging and outpatient sites: a live day
board per site, booking with conflict-safe slots, and visit status tracking.
"MedVisit" is a working codename.

This is an early demo. It runs on synthetic data only.

## Stack

- TanStack Start (Vite, React 19), Tailwind CSS 4, shadcn/ui on Base UI
- Convex, self-hosted in Docker for development and the on-prem demo
- Vitest with `convex-test` for domain and backend tests

## Local setup

Needs Node 26.13+, pnpm 12.16.1 and Docker.

```bash
pnpm worktree:setup                 # install from the lockfile
pnpm convex:up                      # local Convex on 127.0.0.1:3410/3411
cp .env.example .env.local          # then paste the key from:
pnpm convex:admin-key
pnpm convex env set MEDVISIT_SYNTHETIC_DEMO true
pnpm convex:deploy                  # push functions and schema
pnpm seed                           # synthetic sites, patients and bookings
pnpm dev                            # http://localhost:3400
```

`pnpm seed` anchors the demo on today. For repeatable screenshots, pin the day
and the clock:

```bash
pnpm seed '{"anchorDate":"2026-11-09","now":1794217200000}'
```

## Checks

```bash
pnpm test        # domain logic and Convex functions
pnpm typecheck
pnpm lint
pnpm build
```
