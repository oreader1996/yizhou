import { createHash, randomBytes } from 'node:crypto';
import { UpstreamRateLimit } from './translate.ts';
import type { Provider } from './translate.ts';

export function createBaiduPacer(callsPerSecond: number) {
  let nextSlot = 0;
  return async () => {
    const now = performance.now();
    const slot = Math.max(now, nextSlot);
    const wait = slot - now;
    if (wait > 1500) throw new UpstreamRateLimit();
    nextSlot = slot + Math.ceil(1000 / callsPerSecond);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, Math.ceil(wait)));
  };
}

export function createBaiduProvider(
  appId: string,
  secret: string,
  fetcher = fetch,
  makeSalt = () => randomBytes(12).toString('hex'),
  pace = createBaiduPacer(1),
): Provider {
  async function send(action: string, text: string, extra = {}) {
    await pace();
    const salt = makeSalt();
    const sign = createHash('md5').update(appId + text + salt + secret).digest('hex');
    const response = await fetcher(`https://fanyi-api.baidu.com/api/trans/vip/${action}`, {
      method: 'POST', body: new URLSearchParams({ q: text, appid: appId, salt, sign, ...extra }),
      signal: AbortSignal.timeout(6000), redirect: 'error',
    });
    if (response.status === 429) throw new UpstreamRateLimit();
    if (!response.ok) throw new Error('Translation provider unavailable');
    const data = await response.json();
    const code = String(data.error_code ?? '0');
    if (['54003', '54004', '54005'].includes(code)) throw new UpstreamRateLimit();
    if (!['0', '52000'].includes(code)) throw new Error('Translation provider returned an error');
    return data;
  }

  return {
    async detect(text) {
      const data = await send('language', text);
      return typeof data.data?.src === 'string' ? data.data.src : null;
    },
    async translate(text, from, to) {
      const data = await send('translate', text, { from, to });
      if (!Array.isArray(data.trans_result) || !data.trans_result.length ||
          data.trans_result.some((row: unknown) => typeof (row as { dst?: unknown } | null)?.dst !== 'string')) {
        throw new Error('Invalid response from translation provider');
      }
      return data.trans_result.map((row: { dst: string }) => row.dst).join('\n');
    },
  };
}
