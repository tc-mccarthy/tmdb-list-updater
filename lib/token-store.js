/** Persist disposable user credentials atomically in a mounted, private directory. */
import { mkdir, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Read a structurally valid, unexpired token record. Corrupt caches are disposable.
 * @param {string} directory Mounted credential directory.
 * @returns {Promise<object|null>} Cached record, or null when missing/invalid/expired.
 */
export async function loadToken(directory) {
  let record;
  try { record = JSON.parse(await readFile(join(directory, 'token.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw new Error('Cannot read token store');
  }
  if (!record || typeof record.access_token !== 'string' || !record.access_token.trim() ||
      !Number.isFinite(Date.parse(record.created_at)) ||
      (record.expires_at !== null && (!Number.isFinite(Date.parse(record.expires_at)) || Date.parse(record.expires_at) <= Date.now()))) return null;
  return record;
}

/**
 * Atomically replace a token file with owner-only permissions; never log its data.
 * @param {string} directory Mounted credential directory, owned by the runtime user.
 * @param {object} record Token plus created_at, expires_at and last_validated_at.
 * @returns {Promise<void>} Resolves after the rename completes.
 */
export async function saveToken(directory, record) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.token-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, join(directory, 'token.json'));
  } finally { await rm(temporary, { force: true }); }
}
