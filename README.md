# tmdb-list-updater

One-shot Node.js utility that appends to or replaces membership of an existing TMDB list using a CSV's `tmdb_id` column. All other CSV columns are ignored. Built from the Newsday Express Docker template, with the HTTP server, AWS, bundler, and watch workflow removed.

## Requirements and quick start

Docker with Compose v2 is the normal runtime. Host development requires Node.js 22+ and Yarn Classic 1.22.22 (`corepack yarn`). No database is needed. Localhost port 8787 is reserved for browser authorization. TMDB must be reachable.

```bash
mkdir -p storage
cp .env.example .env
# Put your CSV in storage/movies.csv and configure .env.
./rebuild
```

Set `TMDB_APPLICATION_TOKEN` to your application **API Read Access Token** from [TMDB API settings](https://www.themoviedb.org/settings/api). On startup the app validates its cached user token. When none is valid, it prints a clickable approval URL; approve it in your browser and the localhost callback captures authorization automatically. Sync then continues and the container stops. No manual user-token copying is required. See [TMDB user authentication](https://developer.themoviedb.org/v4/docs/authentication-user).

The disposable `auth-cache` Docker volume stores the user token privately across rebuilds. Expiry metadata is saved when supplied; otherwise expiration is null and the token is checked remotely on startup. `TMDB_REAUTHORIZE=true ./rebuild` requests fresh approval. `docker compose down -v` deletes the cached credentials. Explicit `TMDB_ACCESS_TOKEN` remains an optional override.

`./rebuild` builds the image, runs in the foreground, streams logs, and returns the sync exit code. The container stops on completion or failure. It remains available for `docker compose logs`; `docker compose down` removes it. Runs are manual: replacing the CSV does not trigger a sync.

## Configuration

Compose reads `.env` or shell variables and passes these settings into the container:

| Variable | Default | Meaning |
| --- | --- | --- |
| TMDB_LIST_URL | Required | HTTPS `https://www.themoviedb.org/list/12345` URL; optional slug accepted |
| TMDB_APPLICATION_TOKEN | Required for new authorization | Application API Read Access Token |
| TMDB_ACCESS_TOKEN | Empty | Optional owner-authorized user token override |
| TMDB_REAUTHORIZE | `false` | Ignore cache/override and request fresh approval |
| AUTH_PORT | `8787` | Callback listener and localhost published port |
| TMDB_CALLBACK_URL | `http://localhost:8787/auth/callback` | Browser redirect; change alongside port |
| AUTH_TIMEOUT_SECONDS | `600` | Wait for approval, 1–900 seconds; bounded by request expiry |
| TOKEN_STORE_PATH | `/usr/app/auth` | Container token directory, fixed in Compose to its volume |
| CSV_PATH | `/usr/app/storage/movies.csv` | Container path under the read-only storage mount |
| UPDATE_MODE | `append` | `append` or `replace` |
| TMDB_MEDIA_TYPE | `movie` | `movie` or `tv`, applied to every CSV ID |
| DRY_RUN | `false` | `true` calculates counts without writes |

IDs must be positive safe integers. Duplicate IDs are collapsed. Missing/duplicate headers, malformed rows, invalid IDs, and empty imports fail before network calls. Each CSV represents one media type; IDs alone cannot distinguish movies from TV. CSV order does not control TMDB display order.

Append adds absent items and retains existing contents. Replace makes membership match the CSV, including removing existing items of the other media type. Additions are verified before removals. List name, privacy, and description are retained. Updates are not atomic; partial failures return nonzero and can be reconciled by rerunning. Avoid concurrent runs or manual edits during a sync.

## Commands

```bash
./rebuild
DRY_RUN=true ./rebuild
UPDATE_MODE=replace ./rebuild
corepack yarn install --frozen-lockfile
npx eslint .
corepack yarn test
corepack yarn test:regression
corepack yarn format
docker compose build
docker compose run --rm tmdb-list-updater
IMAGE_REPOSITORY=your-registry/your-team/tmdb-list-updater ./build-image
# Explicitly publish an image:
IMAGE_REPOSITORY=your-registry/your-team/tmdb-list-updater PUSH_IMAGE=true ./build-image
```

`build-image` uses an optional `IMAGE_TAG`, otherwise a Git revision/timestamp tag. It builds locally unless `PUSH_IMAGE=true`. No secrets or environment settings are baked into images. Runtime images use Node 22 Debian slim and locked production dependencies; rebuild regularly for base image security updates. No build arguments are required.

## Repository and support

- `index.js`: one-shot entry point and safe failure reporting.
- `lib/sync.js`: configuration, CSV parser, TMDB client, and reconciliation.
- `tests/regression/`: deterministic regression battery with local HTTP fixtures.
- `storage/`: ignored local CSV inputs; created by rebuild.
- `Dockerfile`, `docker-compose.yaml`, `rebuild`, `build-image`, `start-service`: container lifecycle.
- `docs/`: [architecture](docs/architecture.md), [configuration](docs/configuration.md), [development](docs/development.md), [operations](docs/operations.md), [testing](docs/testing.md), [API contract](docs/api.md).

Repository maintainers own this utility; report reproducible issues through the repository issue tracker, excluding credentials and private CSV data. See the operations runbook for recovery.

## Troubleshooting

- Docker connection failure: start the Docker daemon; confirm `docker info` works.
- CSV not found/permission denied: put the file in host `storage/`, use its **container** path, and ensure the non-root container user can read it.
- HTTP 401/403: check user authorization and list ownership; application read tokens cannot substitute for owner write access.
- Configuration failure: check `.env`, especially `UPDATE_MODE` and boolean spelling (`true`/`false`).
- Dependency/lint failure: use the documented Node/Yarn versions and a frozen install; rebuild after dependency changes.
- Partial sync: inspect the summary, fix the cause, preview with dry-run, then rerun. No automatic rollback is attempted.

Browser approval defaults assume Docker and the browser share a host. For a remote Docker host, forward the callback port over SSH (for example `ssh -L 8787:127.0.0.1:8787 your-host`) and keep the localhost callback URL. Callback port conflicts fail before printing the approval link. Denial, expiration, invalid exchange, or timeout stops without syncing. Network outages and HTTP 403 do not cause a fresh prompt. Tokens are never printed; the temporary approval URL is deliberately printed so you can click it.
