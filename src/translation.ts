export type Direction = 'auto' | 'zh-en' | 'en-zh';
export type Language = 'zh' | 'en';
export type Request = { text: string; direction: Direction };
export type Translation = { text: string; from: Language; to: Language };
export type Translate = (request: Request) => Promise<Translation>;
export type ErrorCode = 'invalid_input' | 'unsupported_language' | 'rate_limited' | 'unavailable';

export function fitsInputLimit(text: string): boolean {
  return [...text].length <= 1000 && new TextEncoder().encode(text).length <= 2000;
}
