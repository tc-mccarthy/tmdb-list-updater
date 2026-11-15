# Implementation validation

Passed on 2026-11-15:

- `corepack yarn install --frozen-lockfile`
- `npx eslint .`
- `corepack yarn test` and `corepack yarn test:regression` (11 tests in the final regression run).
- `docker compose config --quiet`
- `bash -n rebuild build-image start-service tests/docker-smoke.sh`
- `bash tests/docker-smoke.sh`: actual rebuild path, local HTTP mock, successful sync exit 0, invalid CSV exit 1, stopped sync containers in both cases.
- `IMAGE_REPOSITORY=tmdb-list-updater IMAGE_TAG=smoke ./build-image`: local image build, no push.

The first Docker build attempts timed out in the installed credential helper. The lifecycle smoke passed with an isolated temporary Docker configuration containing no registry credentials and the existing Docker socket/plugin paths; global Docker settings were not modified. Subsequent standard build-image execution passed with the downloaded base image.

No live TMDB calls or registry pushes were performed. Local HTTP stand-ins establish client behavior, not real token authorization or upstream availability. Postman status showed no connected account; official TMDB documentation and Orbit discovery informed the contract, while the committed Node HTTP stand-in provided deterministic verification.

## Startup authorization validation

Passed on 2026-11-15 after adding authorization:

- `npx eslint .` and `node --test`: 22 tests, including expired/revoked cache, forced reauthorization, approval/denial/timeout, invalid state and exchange, cache reuse, and outage discrimination.
- `docker compose config --quiet` and `bash -n rebuild build-image start-service tests/docker-smoke.sh`.
- `bash tests/docker-smoke.sh`: real ./rebuild path with synthetic browser callback and local HTTP token exchange, owner-only volume persistence across recreation, cached-token reuse without another prompt, successful sync exit 0, invalid CSV exit 1, and stopped containers. The dedicated test volume is removed afterward.

No real TMDB approval or user token was available; live authentication remains an acceptance check for the supplied application credential. No production list was modified. The earlier Docker credential-helper workaround was not needed for this smoke run with the base image already cached.
