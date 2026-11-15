# Operations

Run one sync at a time. Use DRY_RUN=true before a replace when reviewing inputs. Completion is the process exit, not a health check: zero means verified membership (or successful dry-run); nonzero means failure, potentially after partial writes. Docker restart policy is no.

Logs contain summary counts and sanitized errors, not CSV rows or tokens. Inspect with `docker compose logs`. Rebuild leaves a stopped container; `docker compose down` removes it. 429 responses and GET server failures retry up to three attempts with bounded waits (maximum 30 seconds each). Network failures and ambiguous write server failures stop immediately. Rerun to reconcile after resolving the cause.

No automatic membership rollback is provided. Keep the previous CSV securely if a future replacement might be needed. Image rollback alone does not restore list contents. Publish using build-image with an explicit repository and PUSH_IMAGE=true; promote the printed tag using your deployment platform, supplying runtime settings separately.
