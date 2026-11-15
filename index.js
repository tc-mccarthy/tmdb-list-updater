/** CLI entry point: validate inputs, authorize, sync once, and exit. */
import { readFile } from 'node:fs/promises';
import { settings, parseCsv, sync } from './lib/sync.js';
import { authSettings, authorize } from './lib/auth.js';
try {
  const config = settings();
  // Reject bad inputs before asking the user to approve browser authorization.
  parseCsv(await readFile(config.csvPath, 'utf8'));
  config.token = await authorize(authSettings());
  console.log(JSON.stringify({ status: 'complete', ...await sync(config) }));
} catch (error) {
  let message = error.message;
  for (const token of [process.env.TMDB_ACCESS_TOKEN, process.env.TMDB_APPLICATION_TOKEN]) {
    if (token) message = message.replaceAll(token, '[REDACTED]');
  }
  console.error(JSON.stringify({ status: 'failed', message }));
  process.exitCode = 1;
}
