import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { createBaiduPacer, createBaiduProvider } from './baidu.ts';
import { openQuota } from './quota.ts';
import { handleTranslation } from './translate.ts';

const configPath = 'service/config.json';

function readConfig(): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Missing ${configPath}. Copy service/config.example.json and fill in the required settings.`);
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected a JSON object in ${configPath}.`);
  }
  return value as Record<string, unknown>;
}

const config = readConfig();

function setting(name: string, fallback?: string): string {
  const value = Object.hasOwn(config, name) ? config[name] : fallback;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Set ${name} to a non-empty string in ${configPath}.`);
  }
  return value;
}

function limit(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = Object.hasOwn(config, name) ? config[name] : fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Set ${name} to an integer from 1 to ${max} in ${configPath}.`);
  }
  return value;
}

const port = limit('PORT', 8787, 65535);
const trustLoopbackProxy = Object.hasOwn(config, 'TRUST_LOOPBACK_PROXY') ? config.TRUST_LOOPBACK_PROXY : false;
if (typeof trustLoopbackProxy !== 'boolean') {
  throw new Error(`Set TRUST_LOOPBACK_PROXY to true or false in ${configPath}.`);
}

const provider = createBaiduProvider(
  setting('BAIDU_APP_ID'),
  setting('BAIDU_APP_SECRET'),
  undefined,
  undefined,
  createBaiduPacer(limit('BAIDU_CALLS_PER_SECOND', 1)),
);
const quotaKey = setting('QUOTA_SECRET');
const quota = openQuota(setting('QUOTA_DB', 'quota.sqlite'), limit('QUOTA_PER_MINUTE', 10), limit('QUOTA_PER_DAY', 200));

createServer({ requestTimeout: 20_000 }, async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST' || req.url !== '/v1/translate') {
    req.resume();
    return send(404, { code: 'invalid_input' });
  }
  const chunks: Buffer[] = [];
  let length = 0;
  let input: unknown;
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      length += chunk.length;
      if (length > 16 * 1024) {
        res.setHeader('Connection', 'close');
        return send(400, { code: 'invalid_input' });
      }
      chunks.push(chunk);
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return send(400, { code: 'invalid_input' });
  }
  const remote = req.socket.remoteAddress ?? '';
  const forwarded = req.headers['x-real-ip'];
  const proxy = trustLoopbackProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  const origin = proxy && typeof forwarded === 'string' && isIP(forwarded) ? forwarded : remote;
  const key = createHmac('sha256', quotaKey).update(origin).digest('hex');
  const result = await handleTranslation(input, provider, calls => quota.reserve(key, new Date(), calls));
  send(result.status, result.body);
}).listen(port, '127.0.0.1', () => {
  console.log('Translation service listening on loopback.');
});
