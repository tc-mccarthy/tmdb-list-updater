/** Validate CSV inputs and reconcile TMDB list membership through the v4 API. */
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'csv-parse/sync';

/**
 * Read runtime environment and reject invalid settings before network I/O.
 * @param {NodeJS.ProcessEnv} env Compose-provided runtime settings.
 * @returns {object} Validated credentials, paths, and sync options.
 * @throws {Error} When any required setting is missing or invalid.
 */
export function settings(env = process.env) {
  const url = new URL(env.TMDB_LIST_URL);
  const match = url.pathname.match(/^\/list\/([1-9]\d*)(?:-[^/]*)?\/?$/);
  if (url.protocol !== 'https:' || !['www.themoviedb.org', 'themoviedb.org'].includes(url.hostname) || url.port || url.username || url.password || !match) throw new Error('TMDB_LIST_URL must be an HTTPS TMDB list URL');
  if (!env.CSV_PATH) throw new Error('CSV_PATH is required');
  const mode = env.UPDATE_MODE || 'append';
  const mediaType = env.TMDB_MEDIA_TYPE || 'movie';
  const dryRun = env.DRY_RUN || 'false';
  if (!['append', 'replace'].includes(mode)) throw new Error('UPDATE_MODE must be append or replace');
  if (!['movie', 'tv'].includes(mediaType)) throw new Error('TMDB_MEDIA_TYPE must be movie or tv');
  if (!['true', 'false'].includes(dryRun)) throw new Error('DRY_RUN must be true or false');
  return { listId: match[1], token: env.TMDB_ACCESS_TOKEN?.trim(), csvPath: env.CSV_PATH, mode, mediaType, dryRun: dryRun === 'true' };
}

/**
 * Parse CSV text, ignoring unrelated fields.
 * @param {string} text Complete UTF-8 CSV contents.
 * @returns {number[]} Unique positive TMDB IDs.
 * @throws {Error} For malformed CSV, invalid IDs, or empty imports.
 */
export function parseCsv(text) {
  const rows = parse(text, { bom: true, skip_empty_lines: true });
  const headers = rows.shift() || [];
  if (headers.filter((header) => header === 'tmdb_id').length !== 1) throw new Error('CSV requires exactly one tmdb_id column');
  const column = headers.indexOf('tmdb_id');
  const ids = new Set();
  rows.forEach((row, index) => {
    const value = row[column].trim();
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid tmdb_id at CSV record ${index + 2}`);
    ids.add(Number(value));
  });
  if (!ids.size) throw new Error('CSV contains no IDs; refusing an empty sync');
  return [...ids];
}

/**
 * Build a bounded, authenticated JSON client. API origin injection is test-only.
 * @param {object} config Validated list ID and user token.
 * @param {object} options Optional HTTP transport and wait dependencies for tests.
 * @returns {Function} Async JSON request function; throws on HTTP or API failure.
 */
export function client(config, { baseUrl = 'https://api.themoviedb.org/4', fetchImpl = fetch, sleep = delay } = {}) {
  return async function request(method, suffix = '', items) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/list/${config.listId}${suffix}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(items ? { body: JSON.stringify({ items }) } : {}),
        });
      } catch {
        // Do not replay ambiguous writes: they may already have committed.
        throw new Error(`TMDB ${method} network failure or timeout; rerun to reconcile`);
      }
      if ((response.status === 429 || (method === 'GET' && response.status >= 500)) && attempt < 2) {
        const retry = response.headers.get('retry-after');
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
        await response.arrayBuffer();
        await sleep(Math.min(30000, Number.isFinite(seconds) ? seconds * 1000 : 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`TMDB ${method} failed with HTTP ${response.status}`);
      let body;
      try { body = await response.json(); } catch { throw new Error('TMDB returned invalid JSON'); }
      if (body.success === false) throw new Error(`TMDB rejected ${method}`);
      return body;
    }
  };
}

/**
 * Read every list page, validating membership data before any removal.
 * @param {Function} request Authenticated TMDB JSON request function.
 * @returns {Promise<object[]>} Membership with media_id and media_type.
 * @throws {Error} When pagination or membership data is malformed.
 */
export async function readList(request) {
  const items = [];
  let pages = 1;
  for (let page = 1; page <= pages; page += 1) {
    const body = await request('GET', `?page=${page}`);
    if (!Array.isArray(body.results) || !Number.isInteger(body.total_pages) || body.total_pages < 0 || body.total_pages > 100000) throw new Error('Invalid TMDB pagination response');
    pages = Math.max(1, body.total_pages);
    for (const item of body.results) {
      if (!Number.isSafeInteger(item.id) || item.id < 1 || !['movie', 'tv'].includes(item.media_type)) throw new Error('Invalid TMDB list item');
      items.push({ media_id: item.id, media_type: item.media_type });
    }
  }
  return items;
}

/** Identify membership using both media type and numeric ID. */
function key(item) { return `${item.media_type}:${item.media_id}`; }

/** Write small batches and require explicit per-item success before proceeding. */
async function writeItems(request, method, items) {
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    const body = await request(method, '/items', batch);
    if (!Array.isArray(body.results) || body.results.length !== batch.length || batch.some((item) => !body.results.some((result) => key(result) === key(item) && result.success === true))) throw new Error(`TMDB ${method} returned incomplete or failed item results; sync may be partial`);
  }
}

/**
 * Reconcile one CSV; only remove extras after additions have been verified.
 * @param {object} config Validated runtime settings, including local csvPath.
 * @param {Function} request TMDB JSON transport (injectable for HTTP tests).
 * @returns {Promise<object>} Counts and mode for the completed sync or preview.
 * @throws {Error} On input, network, item-level, or verification failure.
 * @sideEffects Reads a CSV and, unless dry-run, mutates remote list membership.
 */
export async function sync(config, request = client(config)) {
  const ids = parseCsv(await readFile(config.csvPath, 'utf8'));
  const desired = ids.map((media_id) => ({ media_id, media_type: config.mediaType }));
  const existing = await readList(request);
  const existingKeys = new Set(existing.map(key));
  const desiredKeys = new Set(desired.map(key));
  const additions = desired.filter((item) => !existingKeys.has(key(item)));
  const removals = config.mode === 'replace' ? existing.filter((item) => !desiredKeys.has(key(item))) : [];
  const summary = { mode: config.mode, dryRun: config.dryRun, input: ids.length, additions: additions.length, removals: removals.length };
  if (config.dryRun) return summary;
  await writeItems(request, 'POST', additions);
  if (removals.length) {
    const afterAdd = new Set((await readList(request)).map(key));
    if (desired.some((item) => !afterAdd.has(key(item)))) throw new Error('Additions not verified; no removals attempted');
    await writeItems(request, 'DELETE', removals);
  }
  const final = new Set((await readList(request)).map(key));
  const expected = config.mode === 'replace' ? desiredKeys : new Set([...existingKeys, ...desiredKeys]);
  if (expected.size !== final.size || [...expected].some((item) => !final.has(item))) throw new Error('Final membership verification failed; sync may be partial');
  return summary;
}
