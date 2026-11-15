/** Test browser approval, invalid callbacks, expiration and cached-token startup. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authSettings, authorize } from '../../lib/auth.js';
import { loadToken, saveToken } from '../../lib/token-store.js';

/** Allocate a callback port without requiring a fixed test port. */
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
for (const scenario of ['approve', 'deny', 'timeout', 'expired-request', 'bad-exchange']) {
  test(`authorization: ${scenario}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tmdb-flow-'));
    const port = await freePort();
    let callback;
    let callbacks;
    const config = authSettings({ TMDB_APPLICATION_TOKEN: 'application-secret', TOKEN_STORE_PATH: directory, AUTH_PORT: String(port), TMDB_CALLBACK_URL: `http://localhost:${port}/auth/callback`, AUTH_TIMEOUT_SECONDS: '1' });
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/request_token')) {
        assert.equal(options.headers.Authorization, 'Bearer application-secret');
        callback = JSON.parse(options.body).redirect_to;
        return Response.json({ request_token: 'temporary', expires_at: new Date(Date.now() + (scenario === 'expired-request' ? -1000 : 60000)).toISOString() });
      }
      if (url.endsWith('/access_token')) {
        assert.deepEqual(JSON.parse(options.body), { request_token: 'temporary' });
        return Response.json(scenario === 'bad-exchange' ? {} : { access_token: 'user-secret', account_id: 'account' });
      }
      assert.equal(options.headers.Authorization, 'Bearer user-secret');
      return Response.json({ results: [] });
    };
    try {
      const promise = authorize(config, { fetchImpl, log: (message) => {
        assert.ok(message.includes('https://www.themoviedb.org/auth/access?request_token=temporary'));
        assert.ok(!message.includes('user-secret'));
        if (scenario === 'timeout') return;
        callbacks = (async () => {
          const bad = new URL(callback); bad.searchParams.set('state', 'incorrect');
          assert.equal((await fetch(bad)).status, 404);
          const valid = new URL(callback);
          if (scenario === 'deny') valid.searchParams.set('approved', 'false');
          await fetch(valid);
        })();
      } });
      if (scenario === 'approve') {
        assert.equal(await promise, 'user-secret');
        const record = await loadToken(directory);
        assert.equal(record.expires_at, null);
        assert.ok(record.last_validated_at);
        assert.equal(await authorize(config, { fetchImpl, log: () => assert.fail('Unexpected approval prompt') }), 'user-secret');
      } else await assert.rejects(promise);
      await callbacks;
    } finally { await rm(directory, { recursive: true }); }
  });
}
test('cached validation outage and forbidden response never trigger approval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tmdb-cache-'));
  try {
    await saveToken(directory, { access_token: 'cached', account_id: 'account', created_at: new Date().toISOString(), expires_at: null });
    const config = authSettings({ TOKEN_STORE_PATH: directory });
    for (const status of [403, 429, 503]) await assert.rejects(authorize(config, { fetchImpl: async () => new Response('{}', { status }), log: () => assert.fail('Unexpected approval') }));
    await assert.rejects(authorize(config, { fetchImpl: async () => { throw new Error('secret'); } }), /network/);
    await assert.rejects(authorize(config, { fetchImpl: async () => new Response('{}', { status: 401 }) }), /TMDB_APPLICATION_TOKEN/);
  } finally { await rm(directory, { recursive: true }); }
});
test('authorization configuration validates ports, timeout and flags', () => {
  for (const env of [{ AUTH_PORT: '0' }, { AUTH_TIMEOUT_SECONDS: '901' }, { TMDB_REAUTHORIZE: 'yes' }, { TMDB_CALLBACK_URL: 'file:///tmp/foo' }]) assert.throws(() => authSettings(env));
});
