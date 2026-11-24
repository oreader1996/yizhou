import { fitsInputLimit } from './translation';
import type { Direction, ErrorCode, Language, Translate, Translation } from './translation';
import { lookupAmericanIpa } from './pronunciation';
import type { Speak } from './speech';

export type WindowMode = 'collapsed' | 'expanded' | 'pinned';
export type SetWindowMode = (mode: WindowMode) => Promise<void>;
type WindowControls = { minimize: () => Promise<void>; toggleMaximize: () => Promise<void>; close: () => Promise<void>; startDragging: () => Promise<void> };
type Dependencies = { translate: Translate; copy: (text: string) => Promise<void>; speak: Speak; setWindowMode: SetWindowMode; windowControls?: WindowControls; setAlwaysOnTop?: (enabled: boolean) => Promise<void>; pinUnavailableReason?: string };

const errors: Record<ErrorCode, string> = {
  invalid_input: '文本过长，请缩短后重试。',
  unsupported_language: '无法确定中英翻译方向，请手动选择。',
  rate_limited: '翻译已达调用上限，请稍后重试。',
  unavailable: '暂时无法翻译，请重试。',
};
const autoTranslateDelay = 500;
const speechIcon = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/></svg>`;

export function mountPanel(root: HTMLElement, deps: Dependencies, initial: WindowMode, floating = true) {
  root.innerHTML = `
    <button class="bubble" data-action="expand" aria-label="打开译舟" title="打开译舟">译</button>
    <section class="panel" aria-label="译舟翻译">
      <header class="panel-header">
        <h1>译舟</h1>
        <div class="window-actions">
          <button class="quiet titlebar-control" type="button" data-action="collapse" aria-label="收起" title="收起"><span class="collapse-icon" aria-hidden="true"></span></button>
          <button class="quiet titlebar-control" type="button" data-action="pin" aria-label="置顶" aria-pressed="false"><span class="pin-icon" aria-hidden="true"></span></button>
          <button class="quiet titlebar-control" type="button" data-action="minimize" aria-label="最小化" title="最小化">−</button>
          <button class="quiet titlebar-control" type="button" data-action="maximize" aria-label="最大化" title="最大化">□</button>
          <button class="quiet titlebar-control" type="button" data-action="close" aria-label="关闭" title="关闭">×</button>
        </div>
      </header>
      <div class="panel-body">
        <form>
          <div class="toolbar">
            <select id="direction" aria-label="翻译方向"><option value="auto">自动识别 · 中英互译</option><option value="zh-en">中文 → 英文</option><option value="en-zh">英文 → 中文</option></select>
            <div class="actions">
              <button class="quiet speech-button" type="button" data-action="speak-original" aria-label="朗读原文" title="朗读原文" disabled>${speechIcon}</button>
              <button class="quiet" data-action="translate" type="submit">翻译</button>
            </div>
          </div>
          <p class="ipa" data-ipa="original" hidden></p>
          <div class="source">
            <textarea id="original" aria-label="原文" aria-describedby="translation-notice" placeholder="输入或粘贴要翻译的文字" rows="3" spellcheck="false"></textarea>
            <button class="quiet clear" data-action="clear" type="button" aria-label="清空原文" title="清空原文" hidden>×</button>
          </div>
        </form>
        <section class="result" aria-label="译文">
          <div class="result-header">
            <h2>百度翻译</h2>
            <div class="actions">
              <button class="quiet speech-button" type="button" data-action="speak-result" aria-label="朗读译文" title="朗读译文" disabled>${speechIcon}</button>
              <button class="quiet" type="button" data-action="copy" disabled>复制</button>
            </div>
          </div>
          <output aria-label="翻译结果"></output>
          <p class="ipa" data-ipa="result" hidden></p>
          <p class="status" role="status"></p>
        </section>
        <p class="status speech-status" aria-live="polite"></p>
        <footer id="translation-notice">输入后自动将文字发送至百度翻译。</footer>
      </div>
    </section>`;

  const form = root.querySelector('form')!;
  const text = root.querySelector('textarea')!;
  const direction = root.querySelector('select')!;
  const output = root.querySelector('output')!;
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action=${action}]`)!;
  const submit = button('translate');
  const pin = button('pin');
  const collapse = button('collapse');
  const minimize = button('minimize');
  const maximize = button('maximize');
  const closeWindow = button('close');
  const expand = button('expand');
  const copy = button('copy');
  const clearInput = button('clear');
  const speakOriginal = button('speak-original');
  const speakResult = button('speak-result');
  const originalIpa = root.querySelector<HTMLElement>('[data-ipa=original]')!;
  const resultIpa = root.querySelector<HTMLElement>('[data-ipa=result]')!;
  const speechStatus = root.querySelector<HTMLElement>('.speech-status')!;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  let version = 0;
  let speechVersion = 0;
  let moving = false;
  let composing = false;
  let translation: Translation | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const renderPin = (pinned: boolean) => {
    pin.setAttribute('aria-pressed', String(pinned));
    pin.title = deps.pinUnavailableReason ?? (pin.disabled ? '请在桌面应用中使用置顶' : pinned ? '取消置顶' : '置顶');
  };
  pin.disabled = !deps.setAlwaysOnTop;
  minimize.disabled = maximize.disabled = closeWindow.disabled = !deps.windowControls;

  const renderMode = (mode: WindowMode) => {
    root.dataset.mode = mode;
    panel.hidden = mode === 'collapsed';
    expand.hidden = mode !== 'collapsed';
    collapse.hidden = !floating;
    renderPin(mode === 'pinned');
  };
  renderMode(initial);

  const changeMode = async (mode: WindowMode) => {
    if (moving) return;
    moving = true;
    try {
      await deps.setWindowMode(mode);
      renderMode(mode);
      if (mode === 'expanded') text.focus();
      if (mode === 'collapsed') expand.focus();
    } catch { status.textContent = '无法调整窗口，请重试。'; }
    finally { moving = false; }
  };
  expand.onclick = () => void changeMode('expanded');
  collapse.onclick = () => void changeMode('collapsed');
  pin.onclick = async () => {
    if (moving || !deps.setAlwaysOnTop) return;
    moving = true;
    const pinned = pin.getAttribute('aria-pressed') !== 'true';
    try {
      await deps.setAlwaysOnTop(pinned);
      renderPin(pinned);
    } catch { status.textContent = '无法切换窗口置顶，请重试。'; }
    finally { moving = false; }
  };
  minimize.onclick = () => void deps.windowControls?.minimize();
  maximize.onclick = () => void deps.windowControls?.toggleMaximize();
  closeWindow.onclick = () => void deps.windowControls?.close();
  const header = root.querySelector<HTMLElement>('.panel-header')!;
  header.onmousedown = (event) => {
    if (event.button === 0 && !((event.target as HTMLElement).closest('button')))
      void deps.windowControls?.startDragging();
  };

  const displayIpa = async (field: HTMLElement, value: string) => {
    field.hidden = true;
    field.textContent = '';
    const current = version;
    const ipa = await lookupAmericanIpa(value).catch(() => undefined);
    if (current !== version || !ipa) return;
    field.textContent = `美式 ${ipa}`;
    field.hidden = false;
  };
  const resetTranslation = () => {
    clearTimeout(pending);
    version++;
    speechVersion++;
    translation = undefined;
    output.textContent = '';
    output.removeAttribute('lang');
    status.textContent = '';
    speechStatus.textContent = '';
    copy.disabled = true;
    speakOriginal.disabled = composing || !text.value.trim();
    speakResult.disabled = true;
    void displayIpa(originalIpa, composing ? '' : text.value);
    void displayIpa(resultIpa, '');
    submit.disabled = composing;
    clearInput.hidden = !text.value;
  };
  const translate = async (manual = false) => {
    if (composing || submit.disabled) return;
    const original = text.value.trim();
    resetTranslation();
    if (!original) {
      if (manual) status.textContent = '请输入要翻译的文字。';
      return;
    }
    if (!fitsInputLimit(original)) { status.textContent = errors.invalid_input; return; }
    const current = version;
    submit.disabled = true;
    status.textContent = '翻译中…';
    try {
      const result = await deps.translate({ text: original, direction: direction.value as Direction });
      if (current !== version) return;
      translation = result;
      output.textContent = result.text;
      output.lang = result.to;
      copy.disabled = false;
      speakResult.disabled = !result.text.trim();
      if (result.to === 'en') void displayIpa(resultIpa, result.text);
      status.textContent = '';
    } catch (error) {
      if (current !== version) return;
      const code = (error as { code?: ErrorCode } | null)?.code;
      status.textContent = code && Object.hasOwn(errors, code) ? errors[code] : errors.unavailable;
    } finally { if (current === version) submit.disabled = false; }
  };
  const scheduleTranslation = () => {
    resetTranslation();
    if (!composing && text.value.trim()) {
      pending = setTimeout(() => void translate(), autoTranslateDelay);
    }
  };
  text.oninput = direction.onchange = scheduleTranslation;
  text.addEventListener('compositionstart', () => {
    composing = true;
    resetTranslation();
  });
  text.addEventListener('compositionend', () => {
    composing = false;
    scheduleTranslation();
  });
  clearInput.onclick = () => {
    text.value = '';
    resetTranslation();
    text.focus();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    void translate(true);
  };
  const speak = async (value: string, language: Language) => {
    const current = ++speechVersion;
    speechStatus.textContent = '';
    try {
      await deps.speak(value, language === 'en' ? 'en-US' : 'zh-CN');
    } catch {
      if (current === speechVersion) speechStatus.textContent = '无法朗读，请检查本机语音和音频输出。';
    }
  };
  speakOriginal.onclick = () => {
    const original = text.value.trim();
    const language = translation?.from ?? (direction.value === 'auto'
      ? /\p{Script=Han}/u.test(original) ? 'zh' : 'en'
      : direction.value === 'zh-en' ? 'zh' : 'en');
    void speak(original, language);
  };
  speakResult.onclick = () => {
    if (translation) void speak(translation.text.trim(), translation.to);
  };
  copy.onclick = async () => {
    const current = version;
    try {
      await deps.copy(output.textContent ?? '');
      if (current === version) status.textContent = '已复制译文。';
    } catch { if (current === version) status.textContent = '无法复制，请手动复制。'; }
  };
}
