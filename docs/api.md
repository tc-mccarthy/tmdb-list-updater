# TMDB contract

Base URL: https://api.themoviedb.org/4. Authorization: Bearer user access token. GET /list/{id}?page=N reads results and total_pages; each result supplies id and media_type. POST and DELETE /list/{id}/items send {"items":[{"media_type":"movie","media_id":123}]}. Mutation results must identify each requested item with success=true. Missing or failed item results stop the run before subsequent removals.

References: [details](https://developer.themoviedb.org/v4/reference/list-details), [add](https://developer.themoviedb.org/v4/reference/list-add-items), [remove](https://developer.themoviedb.org/v4/reference/list-remove-items), [user authentication](https://developer.themoviedb.org/v4/docs/authentication-user).

Local HTTP tests model these contracts; live owner authorization and real-provider behavior remain unverified until supplied credentials and a designated list are available. Orbit discovery supplied removal response fields but its integration brief had incomplete auth/body guidance; official TMDB contracts take precedence. No Postman account was connected, so owner mock discovery was skipped.
