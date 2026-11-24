import './panel.css';
import { mountPanel } from './panel';
import { createSpeech } from './speech';
import * as desktop from './desktop';

async function start() {
  const root = document.querySelector<HTMLElement>('#app')!;
  if (!desktop.inDesktop) {
    mountPanel(root, {
      translate: async () => { throw { code: 'unavailable' }; },
      copy: (text) => navigator.clipboard.writeText(text),
      speak: createSpeech(),
      setWindowMode: async () => {},
    }, 'expanded', false);
    return;
  }
  const supportsAlwaysOnTop = await desktop.floatingEnabled().catch(() => false);
  let floating = supportsAlwaysOnTop;
  if (floating) {
    try { await desktop.setWindowMode('collapsed'); }
    catch { floating = false; }
  }
  mountPanel(root, {
    ...desktop,
    setAlwaysOnTop: supportsAlwaysOnTop ? desktop.setAlwaysOnTop : undefined,
    pinUnavailableReason: supportsAlwaysOnTop ? undefined : '当前桌面会话不支持应用控制窗口置顶',
  }, floating ? 'collapsed' : 'expanded', floating);
}

void start();
