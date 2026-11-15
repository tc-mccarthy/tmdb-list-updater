# Testing

Run `npx eslint .`, `corepack yarn test`, and `corepack yarn test:regression`. The regression battery is in tests/regression/ and uses temporary, synthetic CSVs plus a local HTTP server. No real tokens, CSVs, or external services are required. Authorization tests cover atomic private cache files, expiry, browser approval, denial, timeout, callback-state mismatch, token exchange failure, and cached validation outages. It covers parser/config validation, paginated append/replace, dry-run, repeated sync, item failures, authentication failure, and bounded server/rate-limit retries.

Host commands require dev dependencies; the production image deliberately contains only runtime dependencies. Docker validation uses `docker compose config --quiet`, `docker compose build`, and the actual ./rebuild lifecycle. Do not point smoke tests at a real list without explicit authorization. See validation.md for commands exercised during implementation.

Run `bash tests/docker-smoke.sh` to build and drive ./rebuild against a synthetic HTTP service in a dedicated Compose project. The test automatically follows a synthetic approval callback, checks cached-token reuse across rebuilds, and checks exit codes 0 and 1 and stopped container state, then removes its containers and temporary fixtures. No real TMDB requests are made.
