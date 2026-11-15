# Configuration

See the README configuration table and .env.example for every runtime setting. Compose passes these variables explicitly. CSV_PATH is a container path, not a host path. The entire host storage/ directory is mounted read-only at /usr/app/storage. Keep .env and storage/ out of Git and Docker build contexts.

TMDB_APPLICATION_TOKEN is the application API Read Access Token. Browser approval obtains an owner-authorized user token; TMDB_ACCESS_TOKEN is an optional explicit user-token override. Rotate it through the deployment environment. No secret build arguments are supported. IMAGE_REPOSITORY, IMAGE_TAG, and PUSH_IMAGE configure build-image in the calling shell, not Compose.

## Disposable authorization cache

The token-store module writes token.json atomically with mode 0600 inside a 0700 directory. Records contain access_token, created_at, expires_at, and last_validated_at. Missing/corrupt/expired records are cache misses. Null expires_at means the provider supplied no expiration; remote validation is required before use. The store must be owned by the runtime user and is intended for a dedicated Docker volume, not CSV storage. Filesystem permission errors fail rather than silently ignoring an inaccessible cache.

See the README for callback and timeout settings. Compose mounts auth-cache at /usr/app/auth. The image initializes this directory for the non-root node user. The cache is disposable; docker compose down -v deletes it.
