# AGENTS.md

This repository runs a single CSV-to-TMDB list synchronization inside a Node.js Docker container.
Keep configuration, scripts, runtime behavior, tests, and documentation aligned.

## Core Expectations

- Keep the utility focused, production-ready, and understandable.
- Prefer clear conventions over clever shortcuts. A new project should be understandable within a few minutes.
- Keep Docker, local development, documentation, tests, linting, and runtime behavior in sync.
- Keep credentials, CSV contents, and deployment-specific values out of source control.
- Preserve unrelated user changes in the working tree.

## Commit Message Conventions

Newsday projects use JIRA smart commits for JIRA/GitHub integration. When a branch name starts with a JIRA ticket key, begin commit subjects with that same ticket key and a colon.

Examples:

- Branch `MIC-140-update-docs` should use commit subjects like `MIC-140: Update service documentation`.
- Branch `ABC-123/fix-api-headers` should use commit subjects like `ABC-123: Fix API header handling`.

If a branch does not include a ticket key, use a concise imperative commit subject and do not invent a ticket key. Keep commit bodies useful for reviewers by including validation commands, deployment notes, or artifact paths when they are relevant to the change.

## Project Contract

- This is a one-shot Node.js CSV-to-TMDB v4 list utility, not an HTTP service.
- Preserve ./rebuild and ./build-image. Rebuild must propagate the sync exit code and leave the container stopped after completion.
- Supply application credentials, callback settings, CSV_PATH, UPDATE_MODE, media type, and dry-run settings through Compose environment variables. Cache user tokens atomically in the private disposable auth volume; validate before every sync and never invent an expiration.
- Keep storage/ gitignored and mounted read-only; exclude CSVs and credentials from images.
- Require tmdb_id, ignore unrelated CSV columns, and validate every input before writes.
- Append preserves existing membership. Replace adds and verifies desired items before removing extras.
- Never log tokens or arbitrary upstream bodies. Do not automatically retry ambiguous writes.
- Use deterministic local HTTP stand-ins for tests. Live list changes require an explicit user request.

## Documentation Standard

Every project created from this template must maintain both:

- A high-level `README.md` for repository entry points, setup, usage, and operational basics.
- A `docs/` directory for deeper technical documentation that does not belong in the README.

### README Requirements

The README should follow common GitHub conventions and stay useful to a new engineer, an operator, and a reviewer. At minimum, include:

- Project name and one-paragraph purpose.
- Runtime requirements, including Node.js version, Docker, Docker Compose, Yarn, and any external services.
- Quick start commands for local development.
- Configuration reference for required and optional environment variables.
- Build, run, rebuild, test, lint, formatting, and Docker commands.
- Expected local URLs, ports, health checks, or CLI entry points.
- Deployment notes, including image naming, tags, build arguments, and environment assumptions.
- Repository structure with short descriptions of important files and folders.
- Testing strategy and how to run focused tests.
- Troubleshooting notes for common Docker, dependency, build, lint, or configuration failures.
- Ownership, support path, and links to any project-specific runbooks.

Keep README examples copy-pastable. When behavior changes, update the README in the same change.

### `docs/` Requirements

Use `docs/` for durable project knowledge that would make the README too long. Recommended files include:

- `docs/architecture.md` for service boundaries, request flow, middleware, dependencies, and runtime diagrams.
- `docs/configuration.md` for environment variables, secrets, Docker build arguments, and deployment-specific settings.
- `docs/development.md` for local workflows, dependency management, debugging, scripts, and common commands.
- `docs/operations.md` for health checks, logging, monitoring, rollback, image promotion, and incident notes.
- `docs/testing.md` for lint, unit, integration, fixture, Docker, and regression testing guidance.
- `docs/api.md` when the service exposes HTTP, queue, file, or data contracts.

Update docs whenever code changes alter behavior, commands, dependencies, configuration, deployment, or operational expectations.

## JavaScript Code Style

All JavaScript and Node configuration code must be authored with durable JSDoc-style documentation.

- Add a top-level JSDoc block to every JavaScript, MJS, and CJS file explaining the file's purpose and main responsibilities.
- Add JSDoc to every public function, middleware, class, constructor-style function, route handler, exported object, and CLI entry point.
- Use standard JSDoc tags such as `@param`, `@returns`, `@throws`, and `@typedef` where they clarify contract boundaries.
- Explain external I/O clearly: HTTP requests and responses, environment variables, filesystem access, Docker-mounted paths, queues, subprocesses, and network calls.
- Prefer clear function signatures and exported names over clever inline behavior.
- Keep inline comments reserved for non-obvious decisions, edge cases, or operational context. Do not use comments that simply repeat the code.

## Commenting Standard For All Files

All project files should be as commented as practical using the native commenting syntax for that file type. Comments should be docstring-compatible: structured, durable, and useful to a future maintainer rather than casual notes.

- Add a top-of-file purpose block to source files, scripts, Docker files, Compose files, config examples, and templates.
- For JavaScript files, use JSDoc for modules, exported members, middleware, route handlers, and entry points.
- For languages without docstrings, use structured comments that mirror docstring sections such as `Purpose`, `Usage`, `Environment`, `Inputs`, `Outputs`, `Side Effects`, and `Operational Notes`.
- Comment environment variables, ports, volumes, build arguments, secrets references, external services, filesystem paths, and non-obvious defaults.
- JSON files cannot contain comments; document important package metadata, scripts, and dependency expectations in README and `docs/` instead.
- Keep comments accurate when behavior changes. A stale comment is a bug in the template.
- Prefer comments that explain intent, constraints, safety, and operational behavior. Avoid comments that merely restate syntax.
- Remove inherited template comments that no longer apply when creating a real project.

## Testing And Quality Gates

- Build tests as you work. Do not postpone test design until the end of an implementation unless the user explicitly requests discovery-only work.
- Add or update tests for every behavioral change, bug fix, parser rule, external contract, Docker startup path, and regression-prone edge case.
- Run `npx eslint .` before signing off on source, configuration, or script changes.
- Run the relevant test suite before signing off on work. If no test suite exists yet, document that gap and run the narrowest meaningful substitute such as lint, Docker build, or startup smoke testing.
- Keep tests runnable inside the Docker workflow or document why a host command is required.
- Prefer focused unit tests for pure JavaScript behavior and integration tests for Express, Docker, external services, or API contracts.
- Treat failing tests as part of the work. Diagnose and fix failures caused by the current change before handoff.
- Before handing off a change, run the narrowest meaningful validation and report exactly what passed or could not be run.
- Do not mark work complete when README/docs/tests no longer describe the current behavior.

### Regression Battery

Every generated project must maintain an ongoing regression battery as behavior matures.

- Keep regression tests in a predictable location such as `tests/regression/` or a documented project-specific equivalent.
- Add a regression test whenever fixing a bug that could recur, changing an external contract, adjusting data parsing, or touching a risky integration path.
- Document the regression battery in `docs/testing.md`, including required fixtures, environment variables, external services, and the exact command to run it.
- Keep regression fixtures small, deterministic, and safe to commit. Large or sensitive fixtures must be documented with retrieval instructions instead of checked in.
- Run the relevant regression tests before signing off on changes that touch covered behavior.
- Keep obsolete regression tests current or remove them in the same change that intentionally retires the behavior they protect.

## Docker Runtime Conventions

- Keep images small, reproducible, and explicit about runtime assumptions.
- Pin or constrain dependencies deliberately; avoid unbounded production dependencies in generated projects.
- Do not bake secrets into Docker images, Compose files, scripts, or committed configuration.
- Use environment variables for deployment-specific values and document each one.
- Keep local Compose behavior distinct from staging and production assumptions.
- Ensure startup scripts fail fast and produce useful logs.
- Keep the Node version, package manager, build command, startup command, exposed ports, and mounted paths synchronized across `Dockerfile`, `docker-compose.yaml`, scripts, README, and `docs/`.

## Shell Script Conventions

- Use `#!/usr/bin/env bash` for Bash scripts.
- Use `set -euo pipefail` for scripts unless there is a documented reason not to.
- Quote paths and variables.
- Prefer `$(...)` command substitution over backticks.
- Validate required environment variables before using them.
- Keep script usage comments accurate and update README command examples when scripts change.

## Dependency Management

- Keep `package.json` understandable and documented for simple services.
- Use `yarn.lock` as the committed dependency lockfile unless a generated project intentionally switches package managers.
- Pin or constrain production dependencies deliberately.
- Remove example dependencies and comments once a real project is created.
- Rebuild the image after dependency changes and verify imports at startup or in tests.

## Definition Of Done

A change is not ready until:

- Code, Docker files, scripts, README, and `docs/` agree with each other.
- Public JavaScript interfaces have useful JSDoc comments.
- New or changed behavior has tests, including regression coverage when the change fixes a bug or protects an established contract.
- Required environment variables and operational assumptions are documented.
- Relevant tests or validation commands have been run.
- The final handoff reports which tests and regression commands passed, failed, or could not be run.
- No inherited template placeholders or unused starter behavior remain.
