# TMDB contract

Base URL: https://api.themoviedb.org/4. Authorization: Bearer user access token. GET /list/{id}?page=N reads results and total_pages; each result supplies id and media_type. POST and DELETE /list/{id}/items send {"items":[{"media_type":"movie","media_id":123}]}. Mutation results must identify each requested item with success=true. Missing or failed item results stop the run before subsequent removals.

References: [details](https://developer.themoviedb.org/v4/reference/list-details), [add](https://developer.themoviedb.org/v4/reference/list-add-items), [remove](https://developer.themoviedb.org/v4/reference/list-remove-items), [user authentication](https://developer.themoviedb.org/v4/docs/authentication-user).

Local HTTP tests model these contracts; live owner authorization and real-provider behavior remain unverified until supplied credentials and a designated list are available. Orbit discovery supplied removal response fields but its integration brief had incomplete auth/body guidance; official TMDB contracts take precedence. No Postman account was connected, so owner mock discovery was skipped.

## Browser authorization contract

POST /4/auth/request_token with the application bearer token sends redirect_to containing a random callback state. The approved original request_token is exchanged by POST /4/auth/access_token using that same application credential. Never accept a token from callback query parameters. Store the returned access_token and account_id. GET /4/account/{account_id}/lists validates a cached user token; an explicit environment user-token override uses GET /3/authentication. Only HTTP 401 triggers reauthorization; 403, rate limits, and outages fail without treating permissions or availability as expired authorization.

The callback requires the expected path and unguessable state; exchange with TMDB establishes approval. Request-token expiry bounds the local timeout. Access tokens with no supplied expiry store expires_at=null, with validation at each startup. The callback is closed on success, rejection, setup failure, or timeout. Browser messages contain no credentials. Actual TMDB callbacks and user permissions still require a live acceptance check.
