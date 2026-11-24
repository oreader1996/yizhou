// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createSpeech } from '../src/speech';

afterEach(() => vi.unstubAllGlobals());

test('uses a local American voice when available', async () => {
  const american = { lang: 'en-US', localService: true };
  const speak = vi.fn(utterance => utterance.onend());
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ lang: 'en-US', localService: false }, { lang: 'en-GB', localService: true }, american],
    cancel() {},
    speak,
  });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(readonly text: string) {} });
  await createSpeech()('clobber', 'en-US');
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'clobber', voice: american }));
});

test('uses the desktop fallback when the WebView has no local Mandarin voice', async () => {
  const speak = vi.fn();
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ lang: 'zh-CN', localService: false }],
    speak,
  });
  vi.stubGlobal('SpeechSynthesisUtterance', class {});
  const fallback = vi.fn(async () => {});
  await createSpeech(fallback)('你好', 'zh-CN');
  expect(fallback).toHaveBeenCalledWith('你好', 'zh-CN');
  expect(speak).not.toHaveBeenCalled();
});
