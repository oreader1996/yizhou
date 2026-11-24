import { fitsInputLimit } from '../../src/translation.ts';
import type { ErrorCode, Language, Translation } from '../../src/translation.ts';

export type Provider = {
  detect(text: string): Promise<string | null>;
  translate(text: string, from: Language, to: Language): Promise<string>;
};

export class UpstreamRateLimit extends Error {}

export async function handleTranslation(input: unknown, provider: Provider, reserve: (calls: number) => boolean | Promise<boolean>) {
  const fail = (status: number, code: ErrorCode) => ({ status, body: { code } });
  if (!input || typeof input !== 'object') return fail(400, 'invalid_input');
  const { text, direction } = input as Record<string, unknown>;
  const original = typeof text === 'string' ? text.trim() : '';
  if (!original || !fitsInputLimit(original) || !['auto', 'en-zh', 'zh-en'].includes(direction as string)) {
    return fail(400, 'invalid_input');
  }
  try {
    if (!await reserve(direction === 'auto' ? 2 : 1)) return fail(429, 'rate_limited');
    const from = direction === 'auto' ? await provider.detect(original) : direction === 'en-zh' ? 'en' : 'zh';
    if (from !== 'zh' && from !== 'en') return fail(422, 'unsupported_language');
    const to = from === 'en' ? 'zh' : 'en';
    const body: Translation = { text: await provider.translate(original, from, to), from, to };
    return { status: 200, body };
  } catch (error) {
    return error instanceof UpstreamRateLimit ? fail(429, 'rate_limited') : fail(503, 'unavailable');
  }
}
