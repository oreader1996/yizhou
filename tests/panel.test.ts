// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { mountPanel } from '../src/panel';
import type { Translation } from '../src/translation';

const result: Translation = { text: '早上好。', from: 'en', to: 'zh' };
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup(translate = vi.fn(async () => result), floating = true) {
  const root = document.createElement('main');
  document.body.append(root);
  const copy = vi.fn(async (_text: string) => {});
  const speak = vi.fn(async (_text: string, _lang: 'en-US' | 'zh-CN') => {});
  const setWindowMode = vi.fn(async () => {});
  const windowControls = {
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    startDragging: vi.fn(async () => {}),
  };
  const setAlwaysOnTop = vi.fn(async (_enabled: boolean) => {});
  mountPanel(root, { translate, copy, speak, setWindowMode, windowControls, setAlwaysOnTop }, 'expanded', floating);
  const input = root.querySelector('textarea')!;
  return {
    root, copy, speak, translate, setWindowMode, setAlwaysOnTop, windowControls,
    enter(text: string) { input.value = text; input.dispatchEvent(new Event('input')); },
    get value() { return input.value; },
    click(action: string) { root.querySelector<HTMLButtonElement>(`[data-action=${action}]`)!.click(); },
  };
}

test('places pin beside the window controls and operates the custom title bar', () => {
  const panel = setup();
  const actions = [...panel.root.querySelector('.window-actions')!.children]
    .map(element => (element as HTMLButtonElement).dataset.action);
  expect(actions).toEqual(['collapse', 'pin', 'minimize', 'maximize', 'close']);
  for (const [action, label] of [['collapse', '收起'], ['pin', '置顶']]) {
    const control = panel.root.querySelector(`[data-action=${action}]`)!;
    expect(control.textContent?.trim()).toBe('');
    expect(control.getAttribute('aria-label')).toBe(label);
    expect(control.querySelector('[aria-hidden=true]')).not.toBeNull();
  }

  panel.click('minimize');
  panel.click('maximize');
  panel.click('close');
  panel.root.querySelector<HTMLElement>('.panel-header')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1, detail: 1 }));

  expect(panel.windowControls.minimize).toHaveBeenCalledOnce();
  expect(panel.windowControls.toggleMaximize).toHaveBeenCalledOnce();
  expect(panel.windowControls.close).toHaveBeenCalledOnce();
  expect(panel.windowControls.startDragging).toHaveBeenCalledOnce();
});

test('automatically translates only the latest text after typing pauses', async () => {
  vi.useFakeTimers();
  const panel = setup();
  panel.enter('Good');
  await vi.advanceTimersByTimeAsync(300);
  panel.enter('Good morning.');
  await vi.advanceTimersByTimeAsync(300);
  expect(panel.translate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(panel.translate.mock.calls).toEqual([[{ text: 'Good morning.', direction: 'auto' }]]);
  expect(panel.root.querySelector('output')!.textContent).toBe(result.text);
});

test('waits for input method composition to finish', async () => {
  vi.useFakeTimers();
  const panel = setup();
  const input = panel.root.querySelector('textarea')!;
  input.dispatchEvent(new CompositionEvent('compositionstart'));
  panel.enter('nihao');
  await vi.advanceTimersByTimeAsync(600);
  expect(panel.translate).not.toHaveBeenCalled();
  input.value = '你好';
  input.dispatchEvent(new CompositionEvent('compositionend'));
  await vi.advanceTimersByTimeAsync(600);
  expect(panel.translate.mock.calls).toEqual([[{ text: '你好', direction: 'auto' }]]);
});

test('switching direction translates the current text again', async () => {
  vi.useFakeTimers();
  const panel = setup();
  panel.enter('Good morning.');
  panel.click('translate');
  const select = panel.root.querySelector('select')!;
  select.value = 'en-zh';
  select.dispatchEvent(new Event('change'));
  await vi.advanceTimersByTimeAsync(600);
  expect(panel.translate.mock.calls).toEqual([
    [{ text: 'Good morning.', direction: 'auto' }],
    [{ text: 'Good morning.', direction: 'en-zh' }],
  ]);
});

test('clearing the input cancels a pending automatic translation', async () => {
  vi.useFakeTimers();
  const panel = setup();
  panel.enter('Good morning.');
  const clear = panel.root.querySelector<HTMLButtonElement>('[data-action=clear]');
  expect(clear).not.toBeNull();
  clear!.click();
  await vi.advanceTimersByTimeAsync(600);
  expect(panel.value).toBe('');
  expect(panel.translate).not.toHaveBeenCalled();
});

test('renders and copies a sentence in manual mode', async () => {
  vi.useFakeTimers();
  const panel = setup();
  panel.root.querySelector('select')!.value = 'en-zh';
  panel.enter('Good morning.');
  panel.click('translate');
  await vi.advanceTimersByTimeAsync(600);
  expect(panel.root.querySelector('output')!.textContent).toBe('早上好。');
  panel.click('copy');
  expect(panel.copy).toHaveBeenCalledWith('早上好。');
  expect(panel.translate).toHaveBeenCalledWith({ text: 'Good morning.', direction: 'en-zh' });
});

test('reads the original and translated text in the detected languages', async () => {
  const panel = setup();
  panel.enter('Good morning.');
  panel.click('speak-original');
  expect(panel.speak).toHaveBeenCalledWith('Good morning.', 'en-US');
  panel.click('translate');
  await vi.waitFor(() => expect(panel.root.querySelector('output')!.textContent).toBe('早上好。'));
  panel.click('speak-result');
  expect(panel.speak).toHaveBeenLastCalledWith('早上好。', 'zh-CN');
});

test('shows American IPA for a single English word and no IPA for a sentence', async () => {
  const panel = setup(vi.fn(async () => ({ text: '恶霸', from: 'en' as const, to: 'zh' as const })));
  panel.enter('clobber');
  panel.click('translate');
  await vi.waitFor(() => expect(panel.root.querySelector('[data-ipa=original]:not([hidden])')?.textContent).toContain('/ˈklɑbɚ/'));
  panel.enter('clobber someone');
  expect(panel.root.querySelector('[data-ipa=original]:not([hidden])')).toBeNull();
});

test('shows American IPA for an English translation and clears it when the original changes', async () => {
  const panel = setup(vi.fn(async () => ({ text: 'Apple', from: 'zh' as const, to: 'en' as const })));
  panel.enter('苹果');
  panel.click('translate');
  await vi.waitFor(() => expect(panel.root.querySelector('[data-ipa=result]:not([hidden])')?.textContent).toContain('/ˈæpəl/'));
  panel.enter('香蕉');
  expect(panel.root.querySelector('[data-ipa=result]:not([hidden])')).toBeNull();
});

test('does not auto-play and displays an error if local reading fails', async () => {
  const panel = setup();
  panel.enter('早上好');
  expect(panel.speak).not.toHaveBeenCalled();
  panel.speak.mockRejectedValueOnce(new Error());
  panel.click('speak-original');
  await vi.waitFor(() => expect(panel.root.querySelector('.speech-status')?.textContent).toContain('本机语音'));
  expect(panel.speak).toHaveBeenCalledWith('早上好', 'zh-CN');
});

test('rejects whitespace', () => {
  const panel = setup();
  panel.enter('　\n');
  panel.click('translate');
  expect(panel.translate).not.toHaveBeenCalled();
});

test('ignores a response for text that has changed', async () => {
  let finish!: (result: Translation) => void;
  const panel = setup(vi.fn(() => new Promise(resolve => { finish = resolve; })));
  panel.enter('Good morning.');
  panel.click('translate');
  panel.enter('Good evening.');
  finish(result);
  await Promise.resolve();
  expect(panel.root.querySelector('output')!.textContent).not.toContain(result.text);
});

test('keeps the input after failure and allows retry', async () => {
  const panel = setup(vi.fn(async () => result).mockRejectedValueOnce({ code: 'unavailable' }));
  panel.enter('Good morning.');
  panel.click('translate');
  await vi.waitFor(() => expect(panel.root.querySelector('[role=status]')!.textContent).toContain('重试'));
  expect(panel.value).toBe('Good morning.');
  panel.click('translate');
  await vi.waitFor(() => expect(panel.root.querySelector('output')!.textContent).toBe(result.text));
});

test('opens, pins and collapses the panel', async () => {
  const panel = setup();
  panel.click('pin');
  await vi.waitFor(() => expect(panel.root.querySelector('[data-action=pin]')?.getAttribute('aria-pressed')).toBe('true'));
  panel.click('collapse');
  await vi.waitFor(() => expect(panel.root.dataset.mode).toBe('collapsed'));
  panel.click('expand');
  await vi.waitFor(() => expect(panel.root.dataset.mode).toBe('expanded'));
  expect(panel.setWindowMode.mock.calls).toEqual([['collapsed'], ['expanded']]);
});

test('the normal window can toggle always-on-top without moving or resizing', async () => {
  const panel = setup(undefined, false);
  const pin = panel.root.querySelector<HTMLButtonElement>('[data-action=pin]')!;
  expect(pin.hidden).toBe(false);
  expect(pin.nextElementSibling).toBe(panel.root.querySelector('[data-action=minimize]'));
  pin.click();
  await vi.waitFor(() => expect(pin.getAttribute('aria-pressed')).toBe('true'));
  expect(pin.title).toBe('取消置顶');
  pin.click();
  await vi.waitFor(() => expect(pin.getAttribute('aria-pressed')).toBe('false'));
  expect(panel.setAlwaysOnTop.mock.calls).toEqual([[true], [false]]);
  expect(panel.setWindowMode).not.toHaveBeenCalled();
});
