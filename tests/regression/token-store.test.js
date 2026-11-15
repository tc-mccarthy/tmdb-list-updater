/** Verify disposable credential cache behavior, expiry and filesystem permissions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadToken, saveToken } from '../../lib/token-store.js';
test('token cache handles missing/corrupt/expired records and atomic private writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tmdb-auth-'));
  try {
    assert.equal(await loadToken(directory), null);
    await writeFile(join(directory, 'token.json'), '{broken');
    assert.equal(await loadToken(directory), null);
    const record = { access_token: 'synthetic', created_at: new Date().toISOString(), expires_at: null, last_validated_at: null };
    await saveToken(directory, record);
    assert.deepEqual(await loadToken(directory), record);
    assert.equal((await stat(join(directory, 'token.json'))).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.deepEqual(await readdir(directory), ['token.json']);
    await saveToken(directory, { ...record, expires_at: '2000-01-01T00:00:00Z' });
    assert.equal(await loadToken(directory), null);
    await saveToken(directory, { ...record, expires_at: 'invalid' });
    assert.equal(await loadToken(directory), null);
  } finally { await rm(directory, { recursive: true }); }
});
