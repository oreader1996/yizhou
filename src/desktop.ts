import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { SetWindowMode } from './panel';
import type { Translate } from './translation';
import { createSpeech } from './speech';
import type { Speak } from './speech';

export const inDesktop = isTauri();
export const floatingEnabled = () => invoke<boolean>('floating_enabled');
export const quit = () => invoke<void>('quit');
export const setWindowMode: SetWindowMode = (mode) => invoke('set_window_mode', { mode });
export const translate: Translate = (request) => invoke('translate', { request });
export const copy = (text: string) => writeText(text);
export const setAlwaysOnTop = (enabled: boolean) => getCurrentWindow().setAlwaysOnTop(enabled);
export const windowControls = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  startDragging: () => getCurrentWindow().startDragging(),
};

let audioContext: AudioContext | undefined;
let playing: AudioBufferSourceNode | undefined;
let speechRequest = 0;
const desktopSpeech = createSpeech(async (text, language) => {
  const current = speechRequest;
  const audio = audioContext ??= new AudioContext();
  const [, wav] = await Promise.all([
    audio.resume(),
    invoke<ArrayBuffer>('synthesize_speech', { text, language }),
  ]);
  const buffer = await audio.decodeAudioData(wav);
  if (current !== speechRequest) return;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.onended = () => {
    source.disconnect();
    if (playing === source) playing = undefined;
  };
  source.start();
  playing = source;
});

export const speak: Speak = (text, language) => {
  speechRequest++;
  playing?.stop();
  playing = undefined;
  return desktopSpeech(text, language);
};
