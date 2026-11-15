# Architecture

Environment → validated CSV → paginated TMDB membership → additions → verify additions → removals (replace only) → verify final membership → process exit.

Node reads the mounted CSV once using csv-parse. Membership keys include media type and ID. Requests use native fetch with a 15-second timeout and no redirects. Writes use batches of 100. There is no HTTP server, scheduler, persistent database, or health endpoint.
