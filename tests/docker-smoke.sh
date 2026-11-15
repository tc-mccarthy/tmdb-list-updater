#!/usr/bin/env bash
# Purpose: Exercise ./rebuild with isolated synthetic CSVs and a local HTTP mock.
# Usage: bash tests/docker-smoke.sh (requires Docker Compose and Node).
# Side effects: Builds images; creates/removes a dedicated Compose project.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
smoke_dir="$(mktemp -d)"
export COMPOSE_PROJECT_NAME=tmdb-list-updater-smoke
export COMPOSE_FILE="$PWD/docker-compose.yaml:$smoke_dir/override.yaml"
# Cleanup only this test project's resources and temporary synthetic inputs.
cleanup() { docker compose down -v >/dev/null 2>&1 || true; rm -rf "$smoke_dir"; }
trap cleanup EXIT
printf 'tmdb_id\n2\n' > "$smoke_dir/input.csv"
cat > "$smoke_dir/redirect.mjs" <<'JS'
/** Redirect the production client's fetch to the isolated mock during smoke tests. */
const realFetch = globalThis.fetch;
globalThis.fetch = (url, options) => realFetch(String(url).replace('https://api.themoviedb.org', 'http://mock:8080'), options);
JS
cat > "$smoke_dir/mock.mjs" <<'JS'
/** Serve synthetic membership and record mutations for the Docker smoke test. */
import { createServer } from 'node:http';
let items = [];
let approvals = 0;
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/4/auth/request_token') {
    let text = ''; for await (const part of req) text += part;
    const callback = new URL(JSON.parse(text).redirect_to);
    callback.hostname = 'tmdb-list-updater';
    approvals += 1;
    setTimeout(() => fetch(callback).catch(() => {}), 300);
    res.end(JSON.stringify({ request_token: 'synthetic-request', expires_at: new Date(Date.now() + 60000).toISOString() })); return;
  }
  if (req.url === '/4/auth/access_token') {
    res.end(JSON.stringify({ access_token: 'synthetic-user', account_id: 'synthetic-account' })); return;
  }
  if (req.url === '/approvals') { res.end(JSON.stringify({ approvals })); return; }
  if (req.method === 'GET') { res.end(JSON.stringify({ total_pages: 1, results: items.map(i => ({ id: i.media_id, media_type: i.media_type })) })); return; }
  let body = ''; for await (const part of req) body += part;
  items = JSON.parse(body).items;
  res.end(JSON.stringify({ results: items.map(i => ({ ...i, success: true })) }));
}).listen(8080, '0.0.0.0');
JS
cat > "$smoke_dir/override.yaml" <<YAML
# Purpose: Isolated test-only transport and synthetic configuration.
services:
  tmdb-list-updater:
    depends_on:
      mock:
        condition: service_healthy
    environment:
      TMDB_LIST_URL: https://www.themoviedb.org/list/123
      TMDB_ACCESS_TOKEN: ""
      TMDB_APPLICATION_TOKEN: synthetic-application
      TMDB_REAUTHORIZE: "false"
      TMDB_CALLBACK_URL: http://localhost:18787/auth/callback
      AUTH_PORT: "18787"
      AUTH_TIMEOUT_SECONDS: "10"
      CSV_PATH: /smoke/input.csv
      UPDATE_MODE: append
      DRY_RUN: "false"
      NODE_OPTIONS: --import=/smoke/redirect.mjs
    volumes:
      - $smoke_dir:/smoke:ro
  mock:
    image: node:22-bookworm-slim
    command: [node, /smoke/mock.mjs]
    volumes:
      - $smoke_dir:/smoke:ro
    healthcheck:
      test: [CMD, node, -e, "fetch('http://localhost:8080').then(r=>{if(!r.ok)process.exit(1)})"]
      interval: 1s
      timeout: 5s
      retries: 30
YAML
# Begin from an empty disposable cache even after an interrupted prior test.
docker compose down -v >/dev/null 2>&1 || true
./rebuild
container_id="$(docker compose ps -aq tmdb-list-updater)"
[[ "$(docker inspect -f '{{.State.Status}}' "$container_id")" == exited ]]
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$container_id")" == 0 ]]
# Second valid startup must validate the volume's user token without prompting.
./rebuild
docker compose logs tmdb-list-updater > "$smoke_dir/second-run.log"
if rg -q 'Approve TMDB access' "$smoke_dir/second-run.log"; then
  echo 'Cached startup unexpectedly requested approval' >&2; exit 1
fi
printf 'tmdb_id\ninvalid\n' > "$smoke_dir/input.csv"
if ./rebuild; then
  echo 'Expected invalid CSV to fail' >&2; exit 1
fi
container_id="$(docker compose ps -aq tmdb-list-updater)"
[[ "$(docker inspect -f '{{.State.Status}}' "$container_id")" == exited ]]
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$container_id")" == 1 ]]
echo 'Docker lifecycle smoke passed: browser approval, cached reuse, success=0, failure=1, containers exited.'
