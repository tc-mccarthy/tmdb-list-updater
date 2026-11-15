/** Exercise CSV validation and real HTTP reconciliation against a local TMDB stand-in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settings, parseCsv, client, sync } from '../../lib/sync.js';

const env = {
  TMDB_LIST_URL: 'https://www.themoviedb.org/list/123-test',
  TMDB_ACCESS_TOKEN: 'fake',
  CSV_PATH: '/unused'
};
test('configuration rejects invalid host, mode, boolean and media type', () => {
  assert.equal(settings(env).mode, 'append');
  for (const change of [
    { TMDB_LIST_URL: 'https://evil.org/list/1' },
    { UPDATE_MODE: 'clear' },
    { DRY_RUN: 'yes' },
    { TMDB_MEDIA_TYPE: 'mixed' }
  ])
    assert.throws(() => settings({ ...env, ...change }));
});
test('CSV supports BOM, CRLF, quoted multiline fields and duplicates', () => {
  assert.deepEqual(
    parseCsv('\ufeffname,tmdb_id\r\n"a,\nb",12\r\nc,12\r\nd,34\r\n'),
    [12, 34]
  );
  for (const csv of [
    'id\n1',
    'tmdb_id\n',
    'tmdb_id\n0',
    'tmdb_id\n1.5',
    'tmdb_id,tmdb_id\n1,2',
    'tmdb_id\n9007199254740992',
    'tmdb_id,x\n1'
  ])
    assert.throws(() => parseCsv(csv));
});
for (const scenario of [
  'append',
  'replace',
  'dry',
  'partial',
  'rate',
  'auth',
  'server',
  'invalid'
]) {
  test(`HTTP sync: ${scenario}`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'tmdb-test-'));
    const csvPath = join(folder, 'input.csv');
    await writeFile(
      csvPath,
      scenario === 'invalid'
        ? 'tmdb_id\nnope'
        : 'tmdb_id,title\n2,test\n3,other\n'
    );
    let items = [
      { media_id: 1, media_type: 'tv' },
      { media_id: 2, media_type: 'movie' }
    ];
    const calls = [];
    let throttled = false;
    const server = createServer(async (req, res) => {
      assert.equal(req.headers.authorization, 'Bearer fake');
      calls.push(req.method);
      res.setHeader('Content-Type', 'application/json');
      if (scenario === 'auth') {
        res.writeHead(401).end('{}');
        return;
      }
      if (scenario === 'server') {
        res.writeHead(503).end('{}');
        return;
      }
      if (scenario === 'rate' && !throttled) {
        throttled = true;
        res.writeHead(429, { 'Retry-After': '0' }).end('{}');
        return;
      }
      if (req.method === 'GET') {
        const page = Number(
          new URL(req.url, 'http://localhost').searchParams.get('page')
        );
        res.end(
          JSON.stringify({
            total_pages: Math.max(1, items.length),
            results: items
              .slice(page - 1, page)
              .map(i => ({ id: i.media_id, media_type: i.media_type }))
          })
        );
        return;
      }
      let text = '';
      for await (const part of req) text += part;
      const batch = JSON.parse(text).items;
      if (scenario !== 'partial') {
        if (req.method === 'POST') items.push(...batch);
        else
          items = items.filter(
            i =>
              !batch.some(
                b => b.media_id === i.media_id && b.media_type === i.media_type
              )
          );
      }
      res.end(
        JSON.stringify({
          results: batch.map(i => ({ ...i, success: scenario !== 'partial' }))
        })
      );
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const config = {
        ...settings(env),
        csvPath,
        mode: scenario === 'append' ? 'append' : 'replace',
        dryRun: scenario === 'dry'
      };
      const request = client(config, {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        sleep: async () => {}
      });
      if (['partial', 'auth', 'server', 'invalid'].includes(scenario)) {
        await assert.rejects(sync(config, request));
        assert.ok(!calls.includes('DELETE'));
        if (scenario === 'invalid') assert.equal(calls.length, 0);
        if (scenario === 'server') assert.equal(calls.length, 3);
      } else {
        await sync(config, request);
        if (scenario === 'dry') assert.ok(calls.every(m => m === 'GET'));
        else {
          assert.equal(items.length, scenario === 'append' ? 3 : 2);
          const before = calls.length;
          await sync(config, request);
          assert.ok(calls.slice(before).every(m => m === 'GET'));
        }
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
      await rm(folder, { recursive: true });
    }
  });
}

test('ambiguous writes are never retried and errors do not expose tokens', async () => {
  let calls = 0;
  const request = client(settings(env), {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('fake secret upstream text');
    }
  });
  await assert.rejects(
    request('POST', '/items', []),
    error => !error.message.includes('secret')
  );
  assert.equal(calls, 1);
  const serverError = client(settings(env), {
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 503 });
    }
  });
  await assert.rejects(serverError('DELETE', '/items', []));
  assert.equal(calls, 2);
});
