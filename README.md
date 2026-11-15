# tmdb-list-updater

One-shot Node.js utility that appends to or replaces membership of an existing TMDB list using a CSV's `tmdb_id` column. All other CSV columns are ignored. Built from the Newsday Express Docker template, with the HTTP server, AWS, bundler, and watch workflow removed.

## Requirements and quick start

Docker with Compose v2 is the normal runtime. Host development requires Node.js 22+ and Yarn Classic 1.22.22 (`corepack yarn`). No database or incoming HTTP ports are needed. TMDB must be reachable.

```bash
mkdir -p storage
cp .env.example .env
# Put your CSV in storage/movies.csv and configure .env.
./rebuild
```

Use a TMDB **v4 user access token** authorized by the list owner, not an application read access token. See [user authentication](https://developer.themoviedb.org/v4/docs/authentication-user). Obtain and approve a request token, exchange it for a user access token, and supply that token yourself; this utility does not conduct interactive login.

`./rebuild` builds the image, runs in the foreground, streams logs, and returns the sync exit code. The container stops on completion or failure. It remains available for `docker compose logs`; `docker compose down` removes it. Runs are manual: replacing the CSV does not trigger a sync.

## Configuration

Compose reads `.env` or shell variables and passes these settings into the container:

| Variable | Default | Meaning |
| --- | --- | --- |
| TMDB_LIST_URL | Required | HTTPS `https://www.themoviedb.org/list/12345` URL; optional slug accepted |
| TMDB_ACCESS_TOKEN | Required | Owner-authorized v4 user token |
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
