import { config, translatorEngine } from '../config.ts';
import { translateAllWithClaude } from './claude.ts';
import type { SummarisedStory } from '../types.ts';
import type { TokenUsage, TranslatorEngine } from '../../shared/types.ts';

/**
 * Brings every summary into English.
 *
 * Two things are worth knowing about where this sits:
 *
 * 1. It runs on summaries, not articles — a translation request carries ~60
 *    words per story instead of 2,500 characters, so it is much cheaper than
 *    the summarising pass it follows.
 * 2. It usually has nothing to do. The Claude summariser writes English
 *    directly from a foreign-language article, so only summaries produced by
 *    the extractive engine ever reach here: a run with no key, `SUMMARIZER=
 *    extractive`, or the batches that fell back after a Claude error.
 *
 * There is no offline translator. Without a key, foreign summaries are served
 * in their own language and flagged, rather than being dropped or passed off
 * as English.
 */

export interface TranslationRun {
  stories: SummarisedStory[];
  translator: TranslatorEngine;
  usage: TokenUsage | null;
  errors: string[];
  /** Stories still in a language other than English when this finished. */
  untranslated: number;
}

const countUntranslated = (stories: SummarisedStory[]): number =>
  stories.filter((s) => s.summary.language !== 'en').length;

export async function translateStories(
  stories: SummarisedStory[]
): Promise<TranslationRun> {
  const translator = translatorEngine();

  const pending = stories.filter((s) => s.summary.language !== 'en');

  if (translator === 'none' || !pending.length) {
    if (translator === 'claude' && !config.anthropicApiKey) {
      throw new Error(
        'TRANSLATOR=claude but ANTHROPIC_API_KEY is not set. ' +
          'Set the key, or use TRANSLATOR=off.'
      );
    }
    return {
      stories,
      translator,
      usage: null,
      errors: [],
      untranslated: countUntranslated(stories),
    };
  }

  if (!config.anthropicApiKey) {
    throw new Error(
      'TRANSLATOR=claude but ANTHROPIC_API_KEY is not set. ' +
        'Set the key, or use TRANSLATOR=off.'
    );
  }

  const { stories: translated, usage, errors } =
    await translateAllWithClaude(pending);

  // Splice the translated stories back into their original positions, so the
  // ranking done upstream survives this stage.
  const byId = new Map(translated.map((s) => [s.id, s]));
  const merged = stories.map((story) => byId.get(story.id) ?? story);

  return {
    stories: merged,
    translator,
    usage,
    errors,
    untranslated: countUntranslated(merged),
  };
}
