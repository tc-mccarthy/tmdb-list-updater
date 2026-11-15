/** Obtain a user token through cached validation or a browser approval callback. */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadToken, saveToken } from './token-store.js';

/**
 * Parse callback and token-cache settings from the Compose environment.
 * @param {NodeJS.ProcessEnv} env Runtime environment.
 * @returns {object} Validated authorization configuration.
 */
export function authSettings(env = process.env) {
  const callback = new URL(env.TMDB_CALLBACK_URL || 'http://localhost:8787/auth/callback');
  const port = Number(env.AUTH_PORT || '8787');
  const timeout = Number(env.AUTH_TIMEOUT_SECONDS || '600');
  if (!['http:', 'https:'].includes(callback.protocol) || callback.username || callback.password || callback.search || callback.hash) throw new Error('Invalid TMDB_CALLBACK_URL');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeout) || timeout < 1 || timeout > 900) throw new Error('Invalid authorization port or timeout');
  if (!['true', 'false'].includes(env.TMDB_REAUTHORIZE || 'false')) throw new Error('TMDB_REAUTHORIZE must be true or false');
  return { callback, port, timeout, directory: env.TOKEN_STORE_PATH || '/usr/app/auth', appToken: env.TMDB_APPLICATION_TOKEN?.trim(), userToken: env.TMDB_ACCESS_TOKEN?.trim(), reauthorize: env.TMDB_REAUTHORIZE === 'true' };
}

/**
 * Request JSON without exposing upstream bodies or credentials in errors.
 * @param {string} path TMDB API path.
 * @param {string} token Bearer credential.
 * @param {object} options Request method, body and test transport.
 * @returns {Promise<object|null>} JSON, or null for an invalid credential.
 */
async function api(path, token, { body, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`https://api.themoviedb.org${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch { throw new Error('TMDB authorization network failure or timeout'); }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`TMDB authorization HTTP ${response.status}; authorization was not reset`);
  let data;
  try { data = await response.json(); } catch { throw new Error('Invalid TMDB authorization response'); }
  if (data.success === false) throw new Error('TMDB authorization request rejected');
  return data;
}

/**
 * Normalize provider timestamps; never invent an access-token expiration.
 * @param {string|undefined} value Provider expiration value.
 * @returns {string|null} ISO timestamp or null if none was supplied.
 */
function expiration(value) {
  if (value == null) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid TMDB token expiration');
  return new Date(time).toISOString();
}

/**
 * Wait for a single state-bound callback, then exchange the original request token.
 * @param {object} config Callback settings and application credential.
 * @param {object} dependencies Injectable fetch and approval-link logger for tests.
 * @returns {Promise<object>} Newly issued user token record.
 */
export async function browserAuthorization(config, { fetchImpl = fetch, log = console.log } = {}) {
  if (!config.appToken) throw new Error('TMDB_APPLICATION_TOKEN is required for browser authorization');
  const callback = new URL(config.callback);
  callback.searchParams.set('state', randomBytes(32).toString('hex'));
  let requestToken;
  let busy = false;
  let resolveApproval;
  let rejectApproval;
  const approval = new Promise((resolve, reject) => { resolveApproval = resolve; rejectApproval = reject; });
  // Attach immediately so setup failures cannot leave an unhandled rejection.
  approval.catch(() => {});
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let incoming;
    try { incoming = new URL(req.url, config.callback); } catch { res.writeHead(400).end('Invalid callback'); return; }
    if (req.method !== 'GET' || incoming.pathname !== callback.pathname || incoming.searchParams.get('state') !== callback.searchParams.get('state')) { res.writeHead(404).end('Unknown callback'); return; }
    if (!requestToken || busy) { res.writeHead(409).end('Authorization is not ready or is already processing'); return; }
    busy = true;
    if (incoming.searchParams.get('approved') === 'false' || incoming.searchParams.has('error')) {
      res.writeHead(403).end('Authorization declined. Return to the terminal.');
      rejectApproval(new Error('TMDB authorization declined')); return;
    }
    try {
      const data = await api('/4/auth/access_token', config.appToken, { fetchImpl, body: { request_token: requestToken } });
      if (!data?.access_token || typeof data.access_token !== 'string' || typeof data.account_id !== 'string' || !data.account_id) throw new Error('TMDB did not issue a user access token');
      const record = { access_token: data.access_token, account_id: data.account_id, created_at: new Date().toISOString(), expires_at: expiration(data.expires_at), last_validated_at: null };
      if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) throw new Error('TMDB issued an expired token');
      res.end('Authorization received. Return to the terminal for sync progress.');
      resolveApproval(record);
    } catch (error) {
      res.writeHead(400).end('Authorization failed. Return to the terminal.');
      rejectApproval(error);
    }
  });
  let timer;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '0.0.0.0', resolve); });
    const data = await api('/4/auth/request_token', config.appToken, { fetchImpl, body: { redirect_to: callback.href } });
    if (typeof data?.request_token !== 'string' || !data.request_token) throw new Error('TMDB did not issue a request token');
    requestToken = data.request_token;
    const expiresAt = expiration(data.expires_at);
    const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : 900000;
    if (remaining <= 0) throw new Error('TMDB issued an expired request token');
    timer = setTimeout(() => rejectApproval(new Error('TMDB authorization timed out')), Math.min(config.timeout * 1000, remaining));
    log(`Approve TMDB access in your browser:\nhttps://www.themoviedb.org/auth/access?request_token=${encodeURIComponent(requestToken)}`);
    return await approval;
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * Validate an existing user token, or authorize and atomically cache a new one.
 * @param {object} config Validated authorization settings.
 * @param {object} dependencies Optional fetch/logger dependencies for local tests.
 * @returns {Promise<string>} User access token ready for list requests.
 */
export async function authorize(config, dependencies = {}) {
  let record = config.reauthorize ? null : config.userToken ? { access_token: config.userToken } : await loadToken(config.directory);
  if (record) {
    const path = record.account_id ? `/4/account/${encodeURIComponent(record.account_id)}/lists?page=1` : '/3/authentication';
    const valid = await api(path, record.access_token, dependencies);
    if (valid) {
      if (!config.userToken) await saveToken(config.directory, { ...record, last_validated_at: new Date().toISOString() });
      return record.access_token;
    }
  }
  record = await browserAuthorization(config, dependencies);
  const valid = await api(`/4/account/${encodeURIComponent(record.account_id)}/lists?page=1`, record.access_token, dependencies);
  if (!valid) throw new Error('New TMDB user token failed validation');
  await saveToken(config.directory, { ...record, last_validated_at: new Date().toISOString() });
  return record.access_token;
}
