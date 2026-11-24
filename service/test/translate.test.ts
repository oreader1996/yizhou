import { expect, test, vi } from 'vitest';
import { handleTranslation } from '../src/translate';
import { createBaiduProvider, createBaiduPacer } from '../src/baidu';
import { openQuota } from '../src/quota';

test.each([['zh', 'en'], ['en', 'zh']] as const)('routes %s to %s', async (from, to) => {
  const translate = vi.fn(async () => 'result');
  const response = await handleTranslation({ text: 'sample', direction: 'auto' }, { detect: async () => from, translate }, () => true);
  expect(response).toEqual({ status: 200, body: { text: 'result', from, to } });
  expect(translate).toHaveBeenCalledWith('sample', from, to);
});

test('skips detection with an explicit direction', async () => {
  const detect = vi.fn(async () => null);
  const response = await handleTranslation({ text: '你好', direction: 'zh-en' }, { detect, translate: async () => 'Hello' }, () => true);
  expect(response.status).toBe(200);
  expect(detect).not.toHaveBeenCalled();
});

test.each(['jp', null])('asks the user to choose a direction for %s', async language => {
  const response = await handleTranslation({ text: 'sample', direction: 'auto' }, { detect: async () => language, translate: async () => 'result' }, () => true);
  expect(response).toEqual({ status: 422, body: { code: 'unsupported_language' } });
});

test.each(['x'.repeat(1001), '字'.repeat(667)])('rejects oversized text before sending it', async text => {
  const detect = vi.fn(async () => 'en');
  const response = await handleTranslation({ text, direction: 'auto' }, { detect, translate: async () => 'result' }, () => true);
  expect(response.status).toBe(400);
  expect(detect).not.toHaveBeenCalled();
});

test('returns 429 without sending data when quota is exhausted', async () => {
  const detect = vi.fn(async () => 'en');
  const response = await handleTranslation({ text: 'apple', direction: 'auto' }, { detect, translate: async () => '苹果' }, () => false);
  expect(response.status).toBe(429);
  expect(detect).not.toHaveBeenCalled();
});

test('reserves the last global slot once', async () => {
  const quota = openQuota(':memory:', 10, 1);
  try {
    const now = new Date('2026-11-23T01:00:00Z');
    expect(await Promise.all(['a', 'b'].map(key => Promise.resolve().then(() => quota.reserve(key, now))))).toEqual([true, false]);
    expect(quota.reserve('b', new Date('2026-11-24T01:00:00Z'))).toBe(true);
  } finally { quota.close(); }
});

test('automatic mode reserves two upstream calls before sending text', async () => {
  const reserve = vi.fn((calls: number) => calls <= 1);
  const detect = vi.fn(async () => 'en');
  const result = await handleTranslation({ text: 'apple', direction: 'auto' }, { detect, translate: async () => '苹果' }, reserve);
  expect(result.status).toBe(429);
  expect(reserve).toHaveBeenCalledWith(2);
  expect(detect).not.toHaveBeenCalled();
});

test('applies the upstream daily limit to weighted reservations', () => {
  const quota = openQuota(':memory:', 10, 3);
  try {
    const now = new Date('2026-11-23T01:00:00Z');
    expect(quota.reserve('a', now, 2)).toBe(true);
    expect(quota.reserve('b', now, 2)).toBe(false);
    expect(quota.reserve('b', now, 1)).toBe(true);
  } finally { quota.close(); }
});

test('sends signed forms to Baidu and joins translated segments', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ error_code: 0, data: { src: 'en' } }))
    .mockResolvedValueOnce(Response.json({ trans_result: [{ dst: '苹果' }, { dst: '梨' }] }));
  const provider = createBaiduProvider('2015063000000001', '12345678', fetcher, () => '1435660288', async () => {});
  expect(await provider.detect('apple')).toBe('en');
  expect(await provider.translate('apple\npear', 'en', 'zh')).toBe('苹果\n梨');
  expect(fetcher.mock.calls[0][0]).toBe('https://fanyi-api.baidu.com/api/trans/vip/language');
  expect((fetcher.mock.calls[0][1]!.body as URLSearchParams).get('sign')).toBe('f89f9594663708c1605f3d736d01d2d4');
  expect(fetcher.mock.calls[1][0]).toBe('https://fanyi-api.baidu.com/api/trans/vip/translate');
  expect((fetcher.mock.calls[1][1]!.body as URLSearchParams).get('to')).toBe('zh');
});

test('spaces concurrent upstream calls and rejects a queue that exceeds the wait budget', async () => {
  vi.useFakeTimers();
  try {
    const pace = createBaiduPacer(1);
    await pace();
    const second = pace();
    await expect(pace()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await second;
  } finally { vi.useRealTimers(); }
});
