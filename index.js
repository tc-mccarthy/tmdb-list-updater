/** CLI entry point: run one sync and return a nonzero exit status on failure. */
import { settings, sync } from './lib/sync.js';
try {
  console.log(
    JSON.stringify({ status: 'complete', ...(await sync(settings())) })
  );
} catch (error) {
  // Never emit arbitrary upstream bodies, CSV data, credentials, or URLs.
  const token = process.env.TMDB_ACCESS_TOKEN;
  console.error(
    JSON.stringify({
      status: 'failed',
      message: token
        ? error.message.replaceAll(token, '[REDACTED]')
        : error.message
    })
  );
  process.exitCode = 1;
}
