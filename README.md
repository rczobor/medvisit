# MedVisit

Front-desk scheduling for the clinic's imaging and outpatient sites: a live day
board per site, booking with conflict-safe slots, and visit status tracking.
"MedVisit" is a working codename.

This is an early demo. It runs on synthetic data only.

## Stack

- TanStack Start (Vite, React 19), Tailwind CSS 4, shadcn/ui on Base UI
- Convex: self-hosted in Docker for development, Convex Cloud (EU) for the
  hosted demo
- Clerk for staff sign-in; the demo is hosted on Vercel
- Vitest with `convex-test` for domain and backend tests

## Local setup

Needs Node 26.13+, pnpm 12.16.1 and Docker.

```bash
pnpm worktree:setup                 # install from the lockfile
pnpm convex:up                      # local Convex on 127.0.0.1:3410/3411
cp .env.example .env.local          # then paste the key from:
pnpm convex:admin-key
pnpm convex env set MEDVISIT_SYNTHETIC_DEMO true
pnpm convex env set MEDVISIT_DEMO_WITHOUT_SIGN_IN true
pnpm convex:deploy                  # push functions and schema
pnpm seed                           # synthetic sites, patients and bookings
pnpm dev                            # http://localhost:3400
```

Locally there is no sign-in: without `VITE_CLERK_PUBLISHABLE_KEY` the app
sends no token, and `MEDVISIT_DEMO_WITHOUT_SIGN_IN` lets the backend answer as
the demo receptionist. Never set that flag on a deployment others can reach. A
local backend set up before sign-in existed needs that `env set` line too.

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

## Hosted demo

The demo runs on Vercel at <https://medvisit-eight.vercel.app>, with its backend on
Convex Cloud (project `medvisit`, production deployment in the EU). Only people
invited in the MedVisit Clerk app can sign in; on the demo's synthetic data,
each of them acts as the demo receptionist.

Vercel builds every push to `main` and nothing else: `vercel.json` skips other
branches, and the project has preview deployments turned off. Both platforms
run on free plans, so there are no Convex preview deployments either. The build
runs `convex deploy`, which pushes the functions and schema with the
`CONVEX_DEPLOY_KEY` set on the Vercel project, then builds the static app
against that deployment. The build also needs the project's
`VITE_CLERK_PUBLISHABLE_KEY`: without it the app has no sign-in and every
request fails.

The Convex deployment has `MEDVISIT_SYNTHETIC_DEMO=true` and
`CLERK_JWT_ISSUER_DOMAIN`. It never has `MEDVISIT_DEMO_WITHOUT_SIGN_IN`. The
Clerk instance adds `aud: convex` to session tokens, which `convex/auth.config.ts`
requires.

To reload synthetic data, for example after the week the seed covers has
passed, run with a production deploy key (from the Convex dashboard):

```bash
read -rs CONVEX_DEPLOY_KEY && export CONVEX_DEPLOY_KEY && pnpm seed
```
