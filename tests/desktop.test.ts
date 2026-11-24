// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));

test('the browser preview shows the pin and adjacent minimize and maximize controls', async () => {
  document.body.innerHTML = '<main id="app"></main>';
  await import('../src/main');

  const pin = document.querySelector<HTMLButtonElement>('[data-action=pin]')!;
  const minimize = document.querySelector<HTMLButtonElement>('[data-action=minimize]')!;
  const maximize = document.querySelector<HTMLButtonElement>('[data-action=maximize]')!;
  expect(pin.getAttribute('aria-label')).toBe('置顶');
  expect(pin.hidden).toBe(false);
  expect(pin.disabled).toBe(true);
  expect(pin.nextElementSibling).toBe(minimize);
  expect(minimize.nextElementSibling).toBe(maximize);
  expect(maximize.hidden).toBe(false);
});
