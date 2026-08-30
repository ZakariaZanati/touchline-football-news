/**
 * Language detection, and the prose test built on top of it.
 *
 * The pipeline has one job that looks like two: tell an article apart from a
 * nav bar, and tell which language it is in. Both fall out of the same
 * measurement — the density of function words in a sample.
 *
 * Real reporting runs 0.30-0.37 against its own language's function words.
 * BBC's global nav ("Home News Sport Weather iPlayer…") and ESPN's author rail
 * ("9hRob Dawson9hESPN News Services11hPA…") both score near zero against
 * every language, because a list of links has no grammar in it.
 *
 * Measuring the shape of the text rather than matching each publisher's markup
 * is what makes this keep working when their markup changes — and what makes
 * it extend to a new language by adding a word list rather than a parser.
 */
import type { Language } from '../shared/types.ts';
import { foldAccents } from './text.ts';

const WORDS: Record<Language, string> = {
  en: `the a an and or but of in on at to for with from by is are was were be been
       has have had he she it they we you his her their this that as not will would
       can could there which who when after before over into`,

  // Spanish carries more of its grammar in short function words than English
  // does, so Spanish prose scores a little higher on its own list. The floor
  // below is set for the weaker of the two.
  es: `el la los las un una unos unas de del al a en con por para sin sobre entre
       que se su sus lo le les y o pero no ni es son era eran ha han habia fue
       fueron esta este esa ese esto eso como cuando donde quien mas muy ya
       tambien porque desde hasta tras durante`,
};

const FUNCTION_WORDS = Object.fromEntries(
  Object.entries(WORDS).map(([lang, list]) => [
    lang,
    new Set(foldAccents(list).split(/\s+/).filter(Boolean)),
  ])
) as Record<Language, Set<string>>;

export const LANGUAGES = Object.keys(FUNCTION_WORDS) as Language[];

/** How much of the sample is one language's function words, 0 to 1. */
export function proseScore(sample: string, language: Language): number {
  const tokens = foldAccents(sample)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length < 12) return 0;

  const words = FUNCTION_WORDS[language];
  return tokens.filter((t) => words.has(t)).length / tokens.length;
}

export interface LanguageGuess {
  language: Language;
  /** The winning language's score. Below `PROSE_FLOOR` means "not prose". */
  score: number;
}

/**
 * The best-scoring language for a sample, and how well it scored.
 *
 * English and Spanish share almost no function words, so the winner is
 * usually decisive rather than a coin toss. English wins ties, which only
 * happens when both score zero — and a zero is rejected as not-prose anyway.
 */
export function detectLanguage(sample: string): LanguageGuess {
  let best: LanguageGuess = { language: 'en', score: 0 };
  for (const language of LANGUAGES) {
    const score = proseScore(sample, language);
    if (score > best.score) best = { language, score };
  }
  return best;
}

/** Window and floor are shared by the prose test and the trim that precedes it. */
export const WINDOW = 300;
export const PROSE_FLOOR = 0.15;

/**
 * Is this sample prose, and if so in what language?
 *
 * Uses a narrow window at the front so a junk prefix cannot be averaged out by
 * good text further down.
 */
export function detectProse(text: string): LanguageGuess & { prose: boolean } {
  const guess = detectLanguage(text.slice(0, WINDOW));
  return { ...guess, prose: guess.score >= PROSE_FLOOR };
}
