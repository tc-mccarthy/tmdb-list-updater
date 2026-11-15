# Development

Use Node 22+ and corepack yarn (pinned to Classic 1.22.22). Install with `corepack yarn install --frozen-lockfile`. Run `npx eslint .`, `corepack yarn test`, and `corepack yarn format`. Commit yarn.lock with dependency changes.

The normal container workflow is `./rebuild`. It builds and recreates the one-shot service, waits, and propagates its exit status. For host execution explicitly export runtime settings before `corepack yarn start`; Node does not load .env automatically. No webpack compilation or watcher is used.
