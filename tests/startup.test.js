import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

// These are launcher regression tests, NOT full Express/database integration.
// Copy the real entry file into a fixture whose application has top-level await.
// This tests the same require() -> ESM boundary used in the reported stack trace.
const entry = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const mockApp = `
import { createServer } from 'node:http';
await Promise.resolve();
export function createApp() {
  return { listen(port, host, callback) {
    return createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, marker: process.env.CI_STARTUP_TEST_MARKER || null }));
    }).listen(port, host, callback);
  }};
}
`;
async function fixture(t, app = mockApp, dotenv = '') {
  const dir = await mkdtemp(join(tmpdir(), 'coastal-startup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'server'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, 'server.js'), entry);
  if (app !== null) await writeFile(join(dir, 'server/app.js'), app);
  if (dotenv) await writeFile(join(dir, '.env'), dotenv);
  return dir;
}
function launch(t, dir, { direct = false, env = {} } = {}) {
  const childEnv = { ...process.env };
  delete childEnv.NODE_OPTIONS;
  delete childEnv.CI_STARTUP_TEST_MARKER;
  const args = direct ? [join(dir, 'server.js')]
    : ['--input-type=commonjs', '-e', `require(${JSON.stringify(join(dir, 'server.js'))})`];
  const child = spawn(process.execPath, args, {
    // Use a different working directory so .env is located from the entry path.
    cwd: tmpdir(), env: { ...childEnv, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  // Bound tests even if startup or shutdown unexpectedly hangs.
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 10000);
  exited.finally(() => clearTimeout(watchdog));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    return exited;
  };
  t.after(stop);
  const ready = async () => {
    for (let i = 0; i < 250; i++) {
      const event = stdout.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).find(value => value?.event === 'server_ready');
      if (event) return event;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Startup exited before ready: ${stderr}`);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Startup timeout: ${stderr}`);
  };
  return { child, ready, exited, stop, output: () => ({ stdout, stderr }) };
}

test('Hostinger-style require loads entry even when application uses top-level await', async t => {
  const dir = await fixture(t);
  const child = launch(t, dir);
  const ready = await child.ready();
  assert.equal(ready.startupFix, 'hostinger-require-1');
  assert.ok(ready.port > 0);
  const response = await fetch(`http://127.0.0.1:${ready.port}/probe`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.doesNotMatch(child.output().stderr, /ERR_REQUIRE_ASYNC_MODULE/);
  assert.deepEqual(await child.stop(), { code: 0, signal: null });
});

test('direct node server.js startup remains supported', async t => {
  const dir = await fixture(t);
  const child = launch(t, dir, { direct: true });
  const ready = await child.ready();
  assert.equal(ready.event, 'server_ready');
  assert.equal((await child.stop()).code, 0);
});

test('project .env loads before application import even from a different cwd', async t => {
  const dir = await fixture(t, mockApp, 'CI_STARTUP_TEST_MARKER=fixture-only\n');
  const child = launch(t, dir);
  const ready = await child.ready();
  const body = await (await fetch(`http://127.0.0.1:${ready.port}/probe`)).json();
  assert.equal(body.marker, 'fixture-only');
  await child.stop();
});

test('hosting environment overrides a value in project .env', async t => {
  const dir = await fixture(t, mockApp, 'CI_STARTUP_TEST_MARKER=from-file\n');
  const child = launch(t, dir, { env: { CI_STARTUP_TEST_MARKER: 'from-host' } });
  const ready = await child.ready();
  const body = await (await fetch(`http://127.0.0.1:${ready.port}/probe`)).json();
  assert.equal(body.marker, 'from-host');
  await child.stop();
});

test('invalid port exits with sanitized structured startup error', async t => {
  const dir = await fixture(t);
  const child = launch(t, dir, { env: { PORT: 'not-a-port' } });
  assert.equal((await child.exited).code, 1);
  const error = JSON.parse(child.output().stderr.trim());
  assert.equal(error.event, 'startup_failed');
  assert.equal(error.code, 'INVALID_PORT');
});

test('missing application module is caught without unhandled promise rejection', async t => {
  const dir = await fixture(t, null);
  const child = launch(t, dir);
  assert.equal((await child.exited).code, 1);
  const error = JSON.parse(child.output().stderr.trim());
  assert.equal(error.code, 'ERR_MODULE_NOT_FOUND');
  assert.doesNotMatch(child.output().stderr, /UnhandledPromiseRejection/);
});

test('arbitrary startup error payload is not printed to logs', async t => {
  const dir = await fixture(t, "throw new Error('TEST_SECRET_MUST_NOT_APPEAR');");
  const child = launch(t, dir);
  assert.equal((await child.exited).code, 1);
  assert.equal(JSON.parse(child.output().stderr.trim()).code, 'STARTUP_FAILED');
  assert.doesNotMatch(child.output().stderr, /TEST_SECRET_MUST_NOT_APPEAR/);
});

test('port binding failure produces a controlled EADDRINUSE error', async t => {
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(0, '0.0.0.0', resolve));
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  const dir = await fixture(t);
  const child = launch(t, dir, { env: { PORT: String(blocker.address().port) } });
  assert.equal((await child.exited).code, 1);
  assert.equal(JSON.parse(child.output().stderr.trim()).code, 'EADDRINUSE');
});
