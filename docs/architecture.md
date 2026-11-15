# Architecture

Environment → validated CSV → cached-token validation or browser approval → paginated TMDB membership → additions → verify additions → removals (replace only) → verify final membership → process exit.

Node reads the mounted CSV once using csv-parse. Membership keys include media type and ID. Requests use native fetch with a 15-second timeout and no redirects. Writes use batches of 100. A temporary callback HTTP server runs only during browser approval. There is no scheduler, database, or health endpoint.
