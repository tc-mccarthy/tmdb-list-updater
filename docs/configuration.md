# Configuration

See the README configuration table and .env.example for every runtime setting. Compose passes these variables explicitly. CSV_PATH is a container path, not a host path. The entire host storage/ directory is mounted read-only at /usr/app/storage. Keep .env and storage/ out of Git and Docker build contexts.

TMDB_ACCESS_TOKEN must be an approved v4 user token belonging to the target list owner. Rotate it through the deployment environment. No secret build arguments are supported. IMAGE_REPOSITORY, IMAGE_TAG, and PUSH_IMAGE configure build-image in the calling shell, not Compose.
