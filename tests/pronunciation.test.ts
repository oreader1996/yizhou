import { describe, expect, test } from 'vitest';
import { americanIpa } from '../src/pronunciation';

const pronunciations = {
  clobber: 'K L AA1 B ER0',
  about: 'AH0 B AW1 T',
  aftenposten: 'AE1 F T AH0 N P OW2 S T AH0 N # foreign',
  read: 'R EH1 D',
  'read(2)': 'R IY1 D',
};

describe('American IPA', () => {
  test('converts dictionary vowel, stress and rhotic r sounds', () => {
    expect(americanIpa('Clobber!', pronunciations)).toBe('/ˈklɑbɚ/');
    expect(americanIpa('about', pronunciations)).toBe('/əˈbaʊt/');
  });

  test('does not guess when a single word is missing from the dictionary', () => {
    expect(americanIpa('flibbertigibbet', pronunciations)).toBeUndefined();
  });

  test('does not label phrases as single-word pronunciation', () => {
    expect(americanIpa('read it', pronunciations)).toBeUndefined();
  });

  test('shows multiple dictionary pronunciations for ambiguous words', () => {
    expect(americanIpa('read', pronunciations)).toBe('/ɹɛd/、/ɹid/');
  });

  test('ignores annotations attached to dictionary entries', () => {
    expect(americanIpa('aftenposten', pronunciations)).toBe('/ˈæftənˌpoʊstən/');
  });
});
