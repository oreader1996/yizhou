export type SpeechLanguage = 'en-US' | 'zh-CN';
export type Speak = (text: string, language: SpeechLanguage) => Promise<void>;

function localVoice(language: SpeechLanguage) {
  const speech = window.speechSynthesis;
  if (!speech || typeof SpeechSynthesisUtterance !== 'function') return;
  const locale = language.toLowerCase();
  const primary = locale.split('-')[0];
  const voices = speech.getVoices().filter(voice => voice.localService);
  const tag = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replaceAll('_', '-');
  return voices.find(voice => tag(voice) === locale)
    ?? voices.find(voice => primary === 'en'
      ? /^en(?:-|$)/.test(tag(voice))
      : /^(?:zh$|(?:zh-(?:hans|hant|tw|sg|cn)|cmn)(?:-|$))/.test(tag(voice)));
}

export function createSpeech(fallback?: Speak): Speak {
  return async (text, language) => {
    const voice = localVoice(language);
    const speech = window.speechSynthesis;
    speech?.cancel?.();
    if (!voice) {
      if (!fallback) throw new Error('Local voice unavailable');
      return fallback(text, language);
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = event => {
        if (event.error === 'canceled' || event.error === 'interrupted') resolve();
        else reject(new Error(event.error));
      };
      speech.speak(utterance);
    });
  };
}
