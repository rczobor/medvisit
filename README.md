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

## On-prem demo

The demo runs on a shared host as its own
Compose project `medvisit-demo` with its own Convex backend and volume. It
never touches the host's other projects. The web container serves the build
with `vite preview` and passes `/convex` through to the demo backend, so the
browser needs one address. Only that container is published, on loopback, and
`tailscale serve` exposes it to the tailnet over HTTPS:
`https://demo-host.example.ts.net:8443`.

First setup, on the host:

```bash
git clone git@github.com:rczobor/medvisit.git /docker/medvisit-demo
cd /docker/medvisit-demo
docker compose -f docker-compose.demo.yml up -d --build
# Keep the admin key out of shell history and the repo:
docker compose -f docker-compose.demo.yml exec convex-backend \
  ./generate_admin_key.sh | tail -1 > /docker/medvisit-demo.admin-key
chmod 600 /docker/medvisit-demo.admin-key
tailscale serve --bg --https=8443 http://127.0.0.1:3430
```

Deploy the functions. Run this after first setup and after each update:

```bash
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(cat /docker/medvisit-demo.admin-key)"
demo() {
  docker compose -f docker-compose.demo.yml run --rm \
    -e CONVEX_SELF_HOSTED_ADMIN_KEY web "$@"
}
demo pnpm convex:deploy
```

On first setup only, mark the deployment synthetic and load the demo data:

```bash
demo pnpm convex env set MEDVISIT_SYNTHETIC_DEMO true
demo pnpm seed
```

To update, check out the new `main`, rebuild, then deploy the functions as
above:

```bash
git fetch origin && git checkout --detach origin/main
docker compose -f docker-compose.demo.yml up -d --build
```

`demo pnpm seed` wipes the demo data and starts it over. Run it only when that
is wanted, for example after the week the seed covers has passed.
