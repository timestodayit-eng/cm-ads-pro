import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Hostinger/LiteSpeed loads this file with require(). Keep this module's
// static import graph synchronous. All asynchronous startup belongs INSIDE
// start(), including the dynamic import of the ESM application.
function startupFailed(error) {
  console.error(JSON.stringify({
    event: 'startup_failed',
    code: typeof error?.code === 'string' ? error.code : 'STARTUP_FAILED',
    // Do not print environment variables, tokens, or arbitrary error payloads.
    message: error?.code === 'INVALID_PORT'
      ? 'PORT must be an integer between 0 and 65535.'
      : 'Application startup failed. Check dependencies, environment configuration and the error code.'
  }));
  process.exit(1);
}

async function start() {
  const envFile = fileURLToPath(new URL('./.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw Object.assign(new Error('Invalid PORT'), { code: 'INVALID_PORT' });
  }

  // Do not move this await back to module scope or replace it with require().
  const { createApp } = await import('./server/app.js');
  const app = createApp();
  const server = app.listen(port, '0.0.0.0', () => {
    const address = server.address();
    console.log(JSON.stringify({
      event: 'server_ready',
      port: address && typeof address === 'object' ? address.port : port,
      release: '0.6.0',
      startupFix: 'hostinger-require-1'
    }));
  });
  server.on('error', startupFailed);
  server.requestTimeout = 90000;
  server.headersTimeout = 95000;

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}

// Calling an async function does not introduce top-level await.
start().catch(startupFailed);
