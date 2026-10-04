import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { downloadVerifiedApk } from '../dist/client.js';

const metadata = (body, size = body.length, name = 'sample') => ({
  itemId: '1', packageName: 'dev.example.synthetic', versionCode: 1, version: '1',
  size, md5: createHash('md5').update(body).digest('hex'),
  url: `https://cdn.example.invalid/${name}.apk`,
});

async function inDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-apk-test-'));
  try { await action(directory, join(directory, 'sample.apk')); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function withFetch(fetcher, action) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { await action(); } finally { globalThis.fetch = original; }
}

test('verified publication leaves an unowned legacy partial unchanged', async () => {
  const body = Buffer.from('synthetic APK');
  await inDirectory(async (directory, output) => {
    const legacy = `${output}.${process.pid}.part`;
    await writeFile(legacy, 'unowned file');
    await withFetch(async () => new Response(body, { headers: { 'Content-Length': '9999' } }), async () => {
      assert.equal(await downloadVerifiedApk(metadata(body), output), output);
    });
    assert.deepEqual(await readFile(output), body);
    assert.equal(await readFile(legacy, 'utf8'), 'unowned file');
    assert.equal((await readdir(directory)).length, 2);
  });
});

test('metadata size differences do not block MD5-verified content', async () => {
  const body = Buffer.from('synthetic APK');
  for (const size of [body.length - 1, body.length + 1]) {
    await inDirectory(async (directory, output) => {
      await withFetch(async () => new Response(body, { headers: { 'Content-Length': String(size) } }), async () => {
        assert.equal(await downloadVerifiedApk(metadata(body, size), output), output);
      });
      assert.deepEqual(await readFile(output), body);
      assert.deepEqual(await readdir(directory), ['sample.apk']);
    });
  }
});

test('digest mismatch preserves the existing failure behavior and cleans up', async () => {
  const body = Buffer.from('synthetic APK');
  await inDirectory(async (directory, output) => {
    await withFetch(async () => new Response(Buffer.from('wrong content')), async () => {
      await assert.rejects(downloadVerifiedApk(metadata(body), output), /APK digest mismatch/);
    });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('an interrupted body leaves no partial or completed file', async () => {
  const body = Buffer.from('synthetic APK');
  await inDirectory(async (directory, output) => {
    await withFetch(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(body.subarray(0, 2)); },
      pull(controller) { controller.error(new Error('synthetic interruption')); },
    })), async () => {
      await assert.rejects(downloadVerifiedApk(metadata(body), output, 1), /APK download failed/);
    });
    assert.deepEqual(await readdir(directory), []);
  });
});

test('an existing output survives without a network request', async () => {
  await inDirectory(async (_directory, output) => {
    await writeFile(output, 'last known good');
    await withFetch(async () => { assert.fail('download must not start'); }, async () => {
      await assert.rejects(downloadVerifiedApk(metadata(Buffer.from('replacement')), output), /already exists/);
    });
    assert.equal(await readFile(output, 'utf8'), 'last known good');
  });
});

test('a competing writer cannot alter the completed winners verified bytes', async () => {
  const firstBody = Buffer.alloc(128, 'A');
  const secondBody = Buffer.alloc(128, 'B');
  const firstReady = Promise.withResolvers();
  const secondReady = Promise.withResolvers();
  await inDirectory(async (directory, output) => {
    await withFetch(async url => new Response(new ReadableStream({
      start(controller) {
        if (url.endsWith('/first.apk')) {
          firstReady.promise.then(() => { controller.enqueue(firstBody); controller.close(); });
        } else {
          controller.enqueue(secondBody.subarray(0, 1));
          secondReady.promise.then(() => { controller.enqueue(secondBody.subarray(1)); controller.close(); });
        }
      },
    })), async () => {
      const first = downloadVerifiedApk(metadata(firstBody, firstBody.length, 'first'), output, 1);
      const second = downloadVerifiedApk(metadata(secondBody, secondBody.length, 'second'), output, 1);
      const secondSettled = second.then(value => ({ value }), error => ({ error }));
      try {
        let prefixWritten = false;
        for (let attempt = 0; attempt < 200 && !prefixWritten; attempt++) {
          for (const name of await readdir(directory)) {
            const bytes = await readFile(join(directory, name));
            if (bytes[0] === 66) prefixWritten = true;
          }
          if (!prefixWritten) await delay(10);
        }
        assert.equal(prefixWritten, true, 'the competing download must be actively writing');
        firstReady.resolve();
        assert.equal(await first, output);
        secondReady.resolve();
        const competitor = await secondSettled;
        assert.deepEqual(await readFile(output), firstBody);
        assert.equal(competitor.error?.code, 'EEXIST');
        assert.deepEqual(await readdir(directory), ['sample.apk']);
      } finally {
        firstReady.resolve();
        secondReady.resolve();
        await Promise.allSettled([first, second]);
      }
    });
  });
});
