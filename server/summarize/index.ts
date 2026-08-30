import { config, summarizerEngine } from '../config.ts';
import { summariseAllExtractive } from './extractive.ts';
import { summariseAllWithClaude } from './claude.ts';
import type { ClusteredStory, SummarisedStory } from '../types.ts';
import type { SummaryEngine, TokenUsage } from '../../shared/types.ts';

export { TOPICS } from './topics.ts';

export interface SummaryRun {
  stories: SummarisedStory[];
  engine: SummaryEngine;
  usage: TokenUsage | null;
  errors: string[];
}

/**
 * Picks a summarisation engine and runs it.
 *
 * Extractive is the default so the app works the moment it's cloned. Setting
 * ANTHROPIC_API_KEY upgrades every summary — properly rewritten headlines and
 * prose that reads like a person wrote it — without any other change.
 */
export async function summariseStories(
  stories: ClusteredStory[]
): Promise<SummaryRun> {
  const engine = summarizerEngine();

  if (engine === 'claude') {
    if (!config.anthropicApiKey) {
      throw new Error(
        'SUMMARIZER=claude but ANTHROPIC_API_KEY is not set. ' +
          'Set the key, or use SUMMARIZER=extractive.'
      );
    }
    const { stories: summarised, usage, errors } = await summariseAllWithClaude(stories);
    return { stories: summarised, engine: 'claude', usage, errors };
  }

  return {
    stories: summariseAllExtractive(stories),
    engine: 'extractive',
    usage: null,
    errors: [],
  };
}
