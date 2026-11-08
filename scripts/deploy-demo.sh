#!/usr/bin/env bash
# Rolls the on-prem demo out to the latest merged main (README: On-prem demo).
# Runs on the demo host, from the demo checkout:
#
#   ssh demo-host /docker/medvisit-demo/scripts/deploy-demo.sh
#
# --reseed also wipes the demo data and loads fresh synthetic data.
set -euo pipefail

# Everything runs inside main, which bash reads whole before running it: the
# checkout below replaces this file while it runs.
main() {
  local reseed=false
  case "${1:-}" in
    "") ;;
    --reseed) reseed=true ;;
    *)
      echo "usage: $0 [--reseed]" >&2
      exit 2
      ;;
  esac

  local self
  self="$(readlink -f "$0")"
  cd "$(dirname "$self")/.."
  local key_file="${MEDVISIT_DEMO_ADMIN_KEY_FILE:-/docker/medvisit-demo.admin-key}"
  local port="${MEDVISIT_DEMO_PORT:-3430}"
  # The project is pinned so no COMPOSE_PROJECT_NAME from the environment or a
  # stray .env can point these commands at another project on the host.
  local compose=(docker compose -p medvisit-demo -f docker-compose.demo.yml)

  if [[ -z "${MEDVISIT_DEMO_CHECKED_OUT:-}" ]]; then
    # One rollout at a time; a later one waits, then deploys the newer main.
    # The lock stays held through the exec below.
    exec 9>/run/lock/medvisit-demo-deploy.lock
    if ! flock -w 900 9; then
      echo "Another demo rollout is still running." >&2
      exit 1
    fi
    if [[ ! -r "$key_file" ]]; then
      echo "No admin key at $key_file. Do the first setup in the README." >&2
      exit 1
    fi
    # The demo runs merged main only, never an edit made on the host.
    local dirty
    dirty="$(git status --porcelain --ignored)"
    if [[ -n "$dirty" ]]; then
      echo "The demo checkout has local or ignored files; refusing to deploy:" >&2
      echo "$dirty" >&2
      exit 1
    fi
    git fetch --quiet origin main
    git checkout --quiet --detach origin/main
    # Carry on with this script as main has it, so changes to it apply now.
    MEDVISIT_DEMO_CHECKED_OUT=1 exec "$self" "$@"
  fi
  echo "Deploying $(git log -1 --format='%h %s')"

  # Build, deploy the functions from the new image, then swap the web server,
  # so the new page never runs against old functions. The admin key goes to
  # those one-off runs only.
  "${compose[@]}" build --quiet web
  local admin_key
  admin_key="$(<"$key_file")"
  run() {
    CONVEX_SELF_HOSTED_ADMIN_KEY="$admin_key" "${compose[@]}" run --rm -T \
      -e CONVEX_SELF_HOSTED_ADMIN_KEY web "$@"
  }
  run pnpm convex:deploy
  if [[ "$reseed" == true ]]; then
    run pnpm seed
  fi
  "${compose[@]}" up -d

  local deadline=$((SECONDS + 60))
  until curl -fs --max-time 5 -o /dev/null "http://127.0.0.1:$port/"; do
    if ((SECONDS >= deadline)); then
      echo "The web server did not answer on port $port within 60 s." >&2
      exit 1
    fi
    sleep 2
  done

  # Only this project's superseded builds; other projects' images stay.
  docker image prune --force \
    --filter label=com.docker.compose.project=medvisit-demo >/dev/null
  echo "The demo runs $(git rev-parse --short HEAD)."
}

main "$@"
exit
