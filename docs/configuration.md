# Configuration

See the README configuration table and .env.example for every runtime setting. Compose passes these variables explicitly. CSV_PATH is a container path, not a host path. The entire host storage/ directory is mounted read-only at /usr/app/storage. Keep .env and storage/ out of Git and Docker build contexts.

TMDB_ACCESS_TOKEN must be an approved v4 user token belonging to the target list owner. Rotate it through the deployment environment. No secret build arguments are supported. IMAGE_REPOSITORY, IMAGE_TAG, and PUSH_IMAGE configure build-image in the calling shell, not Compose.

## Disposable authorization cache

The token-store module writes token.json atomically with mode 0600 inside a 0700 directory. Records contain access_token, created_at, expires_at, and last_validated_at. Missing/corrupt/expired records are cache misses. Null expires_at means the provider supplied no expiration; remote validation is required before use. The store must be owned by the runtime user and is intended for a dedicated Docker volume, not CSV storage. Filesystem permission errors fail rather than silently ignoring an inaccessible cache.
