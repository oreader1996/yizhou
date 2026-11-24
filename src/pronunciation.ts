const phones: Record<string, string> = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', 'AH0': 'ə', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', EH: 'ɛ', ER: 'ɝ', 'ER0': 'ɚ', EY: 'eɪ',
  F: 'f', G: 'ɡ', HH: 'h', IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k', L: 'l', M: 'm',
  N: 'n', NG: 'ŋ', OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ',
  T: 't', TH: 'θ', UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
const onsetClusters = new Set([
  'P L', 'P R', 'B L', 'B R', 'T R', 'D R', 'K L', 'K R', 'G L', 'G R', 'F L', 'F R',
  'TH R', 'SH R', 'S L', 'S M', 'S N', 'S P', 'S T', 'S K', 'S W', 'T W', 'D W',
  'K W', 'G W', 'S P L', 'S P R', 'S T R', 'S K L', 'S K R', 'S K W',
]);

function englishWord(text: string) {
  const word = text.trim().toLowerCase().replaceAll('’', "'").replace(/^["'“‘(]+|["'”’).,!?;:]+$/g, '');
  return /^[a-z]+(?:['-][a-z]+)*$/.test(word) ? word : undefined;
}

function toIpa(pronunciation: string): string {
  const codes = pronunciation.split(' #', 1)[0].trim().split(/\s+/);
  const vowels = codes.map((code, index) => (/\d$/.test(code) ? index : -1)).filter(index => index >= 0);
  const stress = new Map<number, string>();
  if (vowels.length > 1) {
    vowels.forEach((vowel, index) => {
      const level = codes[vowel].slice(-1);
      if (level === '0') return;
      const boundary = index === 0 ? 0 : vowels[index - 1] + 1;
      let onset = index === 0 || vowel === boundary ? boundary : vowel - 1;
      while (onset > boundary && onsetClusters.has(codes.slice(onset - 1, vowel).join(' '))) onset--;
      stress.set(onset, level === '1' ? 'ˈ' : 'ˌ');
    });
  }
  return '/' + codes.map((code, index) => (stress.get(index) ?? '') + (phones[code] ?? phones[code.slice(0, -1)])).join('') + '/';
}

export function americanIpa(text: string, dictionary: Record<string, string>): string | undefined {
  const word = englishWord(text);
  if (!word || !Object.hasOwn(dictionary, word)) return;
  const variants = [toIpa(dictionary[word])];
  for (let index = 2; Object.hasOwn(dictionary, `${word}(${index})`); index++) {
    variants.push(toIpa(dictionary[`${word}(${index})`]));
  }
  return [...new Set(variants)].join('、');
}

export async function lookupAmericanIpa(text: string): Promise<string | undefined> {
  if (!englishWord(text)) return;
  const { dictionary } = await import('cmu-pronouncing-dictionary');
  return americanIpa(text, dictionary);
}
