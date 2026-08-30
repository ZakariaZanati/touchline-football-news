import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

import { config } from '../config.ts';
import { errorMessage } from '../errors.ts';
import { normaliseWhitespace } from '../text.ts';
import { summariseExtractive } from './extractive.ts';
import { TOPICS, normaliseTopic, classifyCompetition } from './topics.ts';
import type { ClusteredStory, Summary, SummarisedStory } from '../types.ts';
import type { TokenUsage } from '../../shared/types.ts';

/**
 * One entry as Claude returns it. Structured outputs make the schema binding,
 * but the fields are still treated as optional here — a summary is not worth
 * failing a refresh over, and `adopt` has a sensible answer for each gap.
 */
interface RawSummary {
  id: string;
  headline?: string;
  bottomLine?: string;
  keyFacts?: string[];
  topic?: string;
  competition?: string;
  importance?: number;
}

/**
 * Claude-backed summarisation.
 *
 * Two things make this cheap enough to run on every refresh:
 *   1. Batching — one request covers `claudeBatchSize` stories instead of one
 *      request each, so the instructions are amortised across the batch.
 *   2. Truncation — only the first `claudeBodyChars` of each article are sent.
 *      News is inverted-pyramid, so that prefix holds essentially every fact.
 *
 * The system prompt is marked cacheable, so repeated refreshes read it back at
 * a fraction of the input price instead of re-paying for it each time.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });
  }
  return client;
}

const SYSTEM_PROMPT = `You compress football news into the shortest form that still answers "what happened?".

Your reader is someone who is tired of clicking a teasing headline and then wading through 600 words of padding to find one fact. Give them the fact.

Articles arrive in English or Spanish. Always write your output in English, whatever language the article is in — translate rather than quote. Keep club and player names in the form English readers use ("Atlético Madrid", "Real Sociedad", "La Liga"), and keep every number exactly as the article states it.

For each article you are given, produce:

- headline: a plain, factual restatement of the news in under 90 characters. Strip pull-quotes, teases and outlet branding. State the event itself. "'He's the one we wanted': Newcastle sign Gonzalez" becomes "Newcastle sign Nico Gonzalez from Man City for £50m". Never write "here's why", "revealed", "you won't believe" or any construction whose purpose is to withhold the news.
- bottomLine: 1-3 sentences, at most 60 words total, giving the whole story. Lead with the outcome. Include the numbers that matter — fees, scorelines, contract lengths, how long a player is out. Write plain declarative prose. Do not editorialise, do not speculate beyond the article, do not add background the article does not contain, and never end by pointing at the full article.
- keyFacts: 0-4 very short strings (under 40 characters each) holding the hard details — "£50m fee", "5-year deal", "out 6 weeks", "3-1 at Anfield". Only facts stated in the article. Omit rather than invent.
- topic: one of transfer, match, injury, manager, club, other.
- competition: the competition it concerns ("Premier League", "La Liga", "Champions League", ...), or an empty string if none applies.
- importance: 1-5, where 5 is a major story a fan would want to know today and 1 is filler.

Rules that override everything else:
- Report only what the supplied text states. If the text is thin, write a shorter bottomLine — never pad it with plausible detail.
- If an article is speculation ("could", "eyeing", "linked with"), say so in the bottomLine rather than reporting it as settled.
- Return exactly one entry per input article, echoing its id verbatim.`;

const SUMMARY_SCHEMA: Anthropic.JSONOutputFormat['schema'] = {
  type: 'object',
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          headline: { type: 'string' },
          bottomLine: { type: 'string' },
          keyFacts: { type: 'array', items: { type: 'string' } },
          topic: { type: 'string', enum: TOPICS.map((t) => t.id) },
          competition: { type: 'string' },
          importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        },
        required: [
          'id',
          'headline',
          'bottomLine',
          'keyFacts',
          'topic',
          'competition',
          'importance',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['summaries'],
  additionalProperties: false,
};

function renderBatch(stories: ClusteredStory[]): string {
  return stories
    .map((story, i) => {
      const body = normaliseWhitespace(story.body ?? '').slice(
        0,
        config.claudeBodyChars
      );
      return [
        `<article index="${i + 1}" id="${story.id}">`,
        `<source>${story.sourceName}</source>`,
        `<headline>${story.title}</headline>`,
        `<text>${body || story.rssSummary || '(no body text available)'}</text>`,
        `</article>`,
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
  byId: Map<string, RawSummary>;
  usage: TokenUsage;
}

async function summariseBatch(stories: ClusteredStory[]): Promise<BatchResult> {
  const response = await getClient().messages.create({
    model: config.anthropicModel,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Summarise each of these ${stories.length} articles.\n\n${renderBatch(stories)}`,
      },
    ],
  });

  // Opus 5 runs safety classifiers; a decline returns HTTP 200 with an empty
  // or partial content array, so check before reading it.
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `refused (${response.stop_details?.category ?? 'unspecified'})`
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('hit max_tokens — response truncated');
  }

  const parsed = JSON.parse(firstTextBlock(response)) as {
    summaries?: RawSummary[];
  };
  const byId = new Map(
    (parsed.summaries ?? []).map((s): [string, RawSummary] => [String(s.id), s])
  );

  return {
    byId,
    usage: {
      input: response.usage.input_tokens ?? 0,
      output: response.usage.output_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function adopt(story: ClusteredStory, raw: RawSummary): Summary {
  const competition = normaliseWhitespace(raw.competition ?? '');

  return {
    headline: normaliseWhitespace(raw.headline) || story.title,
    headlineRewritten:
      normaliseWhitespace(raw.headline).toLowerCase() !==
      normaliseWhitespace(story.title).toLowerCase(),
    bottomLine: normaliseWhitespace(raw.bottomLine),
    keyFacts: (raw.keyFacts ?? [])
      .map((f) => normaliseWhitespace(f))
      .filter(Boolean)
      .slice(0, 4),
    topic: normaliseTopic(raw.topic),
    competition:
      competition ||
      classifyCompetition({
        title: story.title,
        lede: (story.body ?? '').slice(0, 600),
        prefer: story.countries,
      }),
    // Claude is instructed to answer in English whatever the article's
    // language, so its output never needs the translation stage.
    language: 'en',
    translated: story.language !== 'en',
    importance:
      typeof raw.importance === 'number' && Number.isFinite(raw.importance)
        ? Math.min(5, Math.max(1, Math.round(raw.importance)))
        : 3,
    engine: 'claude',
  };
}

/**
 * Summarises every story, batching requests and falling back to the extractive
 * engine for any batch that fails. A Claude outage degrades the output quality;
 * it never takes the feed down.
 */
export interface ClaudeSummaryResult {
  stories: SummarisedStory[];
  usage: TokenUsage;
  errors: string[];
}

export async function summariseAllWithClaude(
  stories: ClusteredStory[]
): Promise<ClaudeSummaryResult> {
  const batches: ClusteredStory[][] = [];
  for (let i = 0; i < stories.length; i += config.claudeBatchSize) {
    batches.push(stories.slice(i, i + config.claudeBatchSize));
  }

  const limit = pLimit(3);
  const totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const errors: string[] = [];

  const results = await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        try {
          const { byId, usage } = await summariseBatch(batch);
          for (const key of Object.keys(totals) as (keyof TokenUsage)[]) {
            totals[key] += usage[key];
          }

          return batch.map((story): SummarisedStory => {
            const raw = byId.get(story.id);
            // A story Claude skipped still gets a summary, just a local one.
            return raw
              ? { ...story, summary: adopt(story, raw) }
              : { ...story, summary: summariseExtractive(story) };
          });
        } catch (error) {
          errors.push(errorMessage(error));
          return batch.map((story): SummarisedStory => ({
            ...story,
            summary: summariseExtractive(story),
          }));
        }
      })
    )
  );

  return { stories: results.flat(), usage: totals, errors };
}
