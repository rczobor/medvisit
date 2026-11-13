# MedVisit

Front-desk scheduling for the clinic's imaging (MR, CT, X-ray) and outpatient
sites. The clinical record system stays separate and is out of scope.
"MedVisit" is a codename.

## What must stay true

### 1. Confidential project, synthetic data

- Never name the clinic's software vendors or their products in code,
  comments, commits, PR text, issue text or anything public. The repository
  stays private.
- Development and the demo use synthetic data only. Never import real patient
  data, exports or screenshots of real records into this repository.
- `MEDVISIT_SYNTHETIC_DEMO=true` marks a deployment that holds only synthetic
  data. Anyone who can sign in acts as the demo receptionist there, and
  `seed:reset` may wipe data. Never set it where real patient data exists.
- `MEDVISIT_DEMO_WITHOUT_SIGN_IN=true` also lets callers without a sign-in act
  as the demo receptionist. It is for local development only; never set it on
  a deployment others can reach, including the hosted demo.

### 2. Authorization lives in Convex

Public Convex functions are internet-reachable. Every query and mutation calls
`requireStaff` (or a stricter check) before reading data. Never accept a user
id as an argument. Staff sign in with Clerk; `convex/auth.config.ts` trusts
the issuer in `CLERK_JWT_ISSUER_DOMAIN`. Real data needs a `staff` record per
signed-in user, and nothing creates one yet, so only synthetic deployments
answer.

### 3. Booking can't double-book

`schedule.book`, `schedule.reschedule` and `schedule.setStatus` read every
appointment that could overlap the requested time through the
`by_resourceId_and_startAt` index range. Convex's optimistic concurrency then makes concurrent bookings into the
same window conflict, and one retries and fails with `SLOT_TAKEN`. Keep that
read in the same mutation as the insert or patch. `MAX_APPOINTMENT_MINUTES`
bounds the range, so durations must stay under it.

### 4. Time goes through `convex/lib/time.ts`

Appointments are UTC instants (epoch ms). Working hours are weekly rules in
Budapest wall-clock time. Convert only with the helpers in
`convex/lib/time.ts`, which handle the daylight-saving gap and overlap and are
tested for both. Queries never read the clock: they go stale, so pass the time
in or filter on the client. Mutations may use `Date.now()`.

### 5. Stay portable

The demo runs on Vercel with Convex Cloud. Production hosting is undecided
(a VPS, or Convex Cloud with Vercel or Cloudflare). Keep business logic in
Convex and the app server thin. Don't use Node-only APIs or the local disk from
`src/`. Convex functions use the default runtime unless a separate action file
needs `"use node"`.

## Where code lives

- `convex/lib/` holds pure domain logic (time, availability, status
  transitions, TAJ validation, search folding). The UI imports it too. Test it
  directly.
- `convex/*.ts` holds Convex functions: `catalog`, `schedule`, `patients`, and
  `seed` (synthetic data).
- `src/routes/` holds TanStack file routes. `_desk.tsx` is the front-desk
  layout and owns URL state (`site`, `date`, `appointment`, `book`, `at`).
- `src/components/` holds the board, the sheets and the forms;
  `src/components/ui/` holds shadcn components on Base UI.
- `src/lib/labels.ts` holds all status, source and error wording. Map errors by
  `ConvexError` code, never by message text.

## UI rules

- Interface copy is Hungarian, written for reception staff: plain verbs,
  sentence case, and errors that say what to do next.
- Add components with `pnpm dlx shadcn@4.23.0 add <name>`. `components.json`
  uses the Base UI style. Don't copy UI from other projects.
- Colors, type and radius come from the tokens in `src/styles.css`. The laser
  red (`--laser`) is reserved for the current-time line. Status is never shown
  by color alone: pair it with an icon, a pattern or text.
- Check light and dark themes, and desktop and phone widths. The board may
  scroll sideways; the page must not.

## Local services

`docker compose` runs the project's own Convex backend as compose project
`medvisit` on 127.0.0.1:3410/3411 with its own volume. MedReport's local
services use other ports and volumes; never stop, prune or reuse them from
here. The Convex CLI and the dev server talk to loopback ports, so run them
outside the agent sandbox.

The hosted demo (README: Hosted demo) is on Vercel and Convex Cloud. Vercel
deploys every merge to `main` on its own, functions included. After every PR
you merge, check that the Vercel production deployment for that merge
succeeded and report it. If it failed, report its build log and fix forward
with a PR to `main`. People use the demo to try the app: don't reseed it unasked.

There are no preview deployments. Vercel and Convex run on free plans, and
Convex caps how many deployments a week can create. The Vercel project has
previews turned off, `vercel.json` builds only `main`, and Vercel holds only a
production Convex deploy key. To let someone try a branch, serve it locally and
share it over Tailscale. Set up a preview only when Robi asks for one in that
thread.

## Verification

- While iterating, run `pnpm test` plus `pnpm typecheck`.
- Before handing off, run `pnpm test`, `pnpm typecheck`, `pnpm lint` and
  `pnpm build`.
- `convex-test` reads the clock once, when the harness is created. Set a fake
  clock before calling `setup()`.
