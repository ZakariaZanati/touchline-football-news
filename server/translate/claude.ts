import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

import { config } from '../config.ts';
import { errorMessage } from '../errors.ts';
import { normaliseWhitespace } from '../text.ts';
import type { SummarisedStory } from '../types.ts';
import type { TokenUsage } from '../../shared/types.ts';

/**
 * Claude-backed translation of finished summaries.
 *
 * This runs on the *summary*, not the article: roughly sixty words instead of
 * 2,500 characters, so translating a story costs a fraction of summarising
 * one. Batched and cached the same way for the same reason.
 *
 * Only the extractive engine needs this. The Claude summariser is told to
 * write English whatever the article's language, so its output never reaches
 * here — which means in the common configuration this stage does no work at
 * all.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });
  }
  return client;
}

const SYSTEM_PROMPT = `You translate short football news summaries into English.

You are given summaries that were extracted verbatim from foreign-language articles, so they read like article prose rather than like a summary. Translate them into natural English.

Rules:
- Translate meaning, not words. The result must read as though an English-language outlet wrote it, not as a gloss of the original.
- Keep proper nouns in the form English readers use: "Atlético Madrid", "Real Sociedad", "LaLiga" as "La Liga". Do not translate club or player names.
- Keep every number exactly as given — fees, scorelines, ages, contract lengths, dates. Convert nothing. If the original says €50m, write €50m.
- keyFacts are fragments, not sentences. Keep them fragments, keep them under 40 characters, and keep their order.
- Do not add information, context or interpretation that is not in the text you are given. If a summary is thin, its translation is thin.
- Return exactly one entry per input, echoing its id verbatim.`;

const TRANSLATION_SCHEMA: Anthropic.JSONOutputFormat['schema'] = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          bottomLine: { type: 'string' },
          keyFacts: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'headline', 'bottomLine', 'keyFacts'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

interface RawTranslation {
  id: string;
  headline?: string;
  bottomLine?: string;
  keyFacts?: string[];
}

function renderBatch(stories: SummarisedStory[]): string {
  return stories
    .map((story) => {
      const { summary } = story;
      return [
        `<summary id="${story.id}" language="${summary.language}">`,
        `<headline>${summary.headline}</headline>`,
        `<bottomLine>${summary.bottomLine}</bottomLine>`,
        `<keyFacts>${summary.keyFacts.join(' | ')}</keyFacts>`,
        `</summary>`,
      ].join('\n');
    })
    .join('\n\n');
}

function firstTextBlock(message: Anthropic.Message): string {
  const block = message.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  return block?.text ?? '';
}

interface BatchResult {
  byId: Map<string, RawTranslation>;
  usage: TokenUsage;
}

async function translateBatch(
  stories: SummarisedStory[]
): Promise<BatchResult> {
  const response = await getClient().messages.create({
    model: config.anthropicModel,
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: TRANSLATION_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Translate each of these ${stories.length} summaries into English.\n\n${renderBatch(stories)}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(
      `refused (${response.stop_details?.category ?? 'unspecified'})`
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('hit max_tokens — response truncated');
  }

  const parsed = JSON.parse(firstTextBlock(response)) as {
    translations?: RawTranslation[];
  };

  return {
    byId: new Map(
      (parsed.translations ?? []).map((t): [string, RawTranslation] => [
        String(t.id),
        t,
      ])
    ),
    usage: {
      input: response.usage.input_tokens ?? 0,
      output: response.usage.output_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/** Folds a translation back onto its story, leaving everything else alone. */
function adopt(story: SummarisedStory, raw: RawTranslation): SummarisedStory {
  const headline = normaliseWhitespace(raw.headline) || story.summary.headline;
  const bottomLine =
    normaliseWhitespace(raw.bottomLine) || story.summary.bottomLine;

  return {
    ...story,
    summary: {
      ...story.summary,
      headline,
      bottomLine,
      keyFacts: (raw.keyFacts ?? story.summary.keyFacts)
        .map((f) => normaliseWhitespace(f))
        .filter(Boolean)
        .slice(0, 4),
      language: 'en',
      translated: true,
    },
  };
}

export interface TranslationResult {
  stories: SummarisedStory[];
  usage: TokenUsage;
  errors: string[];
}

/**
 * Translates the given summaries into English, batching requests.
 *
 * A batch that fails leaves its stories in their source language rather than
 * dropping them — the same bargain the summariser makes. They stay flagged
 * `translated: false`, so the UI can say so.
 */
export async function translateAllWithClaude(
  stories: SummarisedStory[]
): Promise<TranslationResult> {
  const batches: SummarisedStory[][] = [];
  for (let i = 0; i < stories.length; i += config.translateBatchSize) {
    batches.push(stories.slice(i, i + config.translateBatchSize));
  }

  const limit = pLimit(3);
  const totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const errors: string[] = [];

  const results = await Promise.all(
    batches.map((batch) =>
      limit(async (): Promise<SummarisedStory[]> => {
        try {
          const { byId, usage } = await translateBatch(batch);
          for (const key of Object.keys(totals) as (keyof TokenUsage)[]) {
            totals[key] += usage[key];
          }
          return batch.map((story) => {
            const raw = byId.get(story.id);
            return raw ? adopt(story, raw) : story;
          });
        } catch (error) {
          errors.push(errorMessage(error));
          return batch;
        }
      })
    )
  );

  return { stories: results.flat(), usage: totals, errors };
}
