import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test } from 'vitest';

const server = fileURLToPath(new URL('../src/server.ts', import.meta.url));
let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'yizhou-service-'));
  mkdirSync(join(cwd, 'service'));
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

test('starts with settings from the JSON file even when environment settings conflict', async () => {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address() as { port: number };
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));

  writeFileSync(join(cwd, 'service/config.json'), JSON.stringify({
    BAIDU_APP_ID: 'test-app',
    BAIDU_APP_SECRET: 'test-secret',
    QUOTA_SECRET: 'test-quota-secret',
    QUOTA_DB: 'test-quota.sqlite',
    PORT: port,
  }));

  const child = spawn(process.execPath, [server], {
    cwd,
    env: { PORT: 'invalid', SYSTEMROOT: process.env.SYSTEMROOT },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 3000,
  });
  let errors = '';
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('close', () => reject(new Error(errors)));
      child.stdout.once('data', () => resolve());
    });
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
    expect(response.status).toBe(404);
    expect(existsSync(join(cwd, 'test-quota.sqlite'))).toBe(true);
  } finally {
    child.kill();
    await closed;
  }
});

test('reports the config file when it is missing', () => {
  const result = spawnSync(process.execPath, [server], { cwd, encoding: 'utf8', timeout: 3000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('service/config.json');
  expect(result.stderr).toContain('service/config.example.json');
});

test('reports malformed JSON without echoing the file contents', () => {
  writeFileSync(join(cwd, 'service/config.json'), 'unparseable-test-secret');
  const result = spawnSync(process.execPath, [server], { cwd, encoding: 'utf8', timeout: 3000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Invalid JSON');
  expect(result.stderr).not.toContain('unparseable-test-secret');
});
