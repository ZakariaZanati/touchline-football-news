import {
  splitSentences,
  tokenise,
  deBaitHeadline,
  extractFacts,
  normaliseWhitespace,
} from '../text.ts';
import { classifyTopic, classifyCompetition } from './topics.ts';
import type {
  ClusteredStory,
  ExtractedStory,
  Summary,
  SummarisedStory,
  TaggedStory,
} from '../types.ts';

/**
 * The minimum a story needs to be summarised locally. Kept structural so the
 * summariser can be handed a story from any stage of the pipeline.
 */
type Summarisable = Pick<
  ExtractedStory,
  'title' | 'body' | 'rssSummary' | 'language'
> &
  Partial<Pick<TaggedStory, 'countries'>>;

/**
 * The zero-config summariser. Runs with no API key and no network calls.
 *
 * News prose is written as an inverted pyramid — the who/what lands in the
 * first sentence or two and everything after is padding, quotes and context.
 * So we score sentences on position, overlap with the headline, and how many
 * hard numbers they carry, then keep the best two in their original order.
 */

const QUOTE_RE = /["“”'‘’]/g;

/** Sentences that exist to fill space rather than report anything. */
const FILLER_RE =
  /\b(?:subscribe|newsletter|sign up|click here|read more|follow us|watch:|listen:|available to stream|live on sky|download the app|terms and conditions|cookie|accessible video player|this video is)\b/i;

/** The whole point is a summary you can take in at a glance. */
const MAX_SUMMARY_CHARS = 250;

/** Article-level context every sentence is scored against. */
interface ScoringContext {
  titleTokens: Set<string>;
  docFreq: Map<string, number>;
  totalSentences: number;
}

function scoreSentence(
  sentence: string,
  index: number,
  { titleTokens, docFreq, totalSentences }: ScoringContext
): number {
  const tokens = tokenise(sentence);
  if (!tokens.length) return -Infinity;

  // Inverted pyramid: earlier is better, steeply.
  const position = 1 / (1 + index * 0.4);

  // Reward terms that recur across the article — the story's actual subject.
  const salience =
    tokens.reduce((sum, t) => sum + (docFreq.get(t) ?? 0), 0) / tokens.length;

  // Reward agreement with the headline.
  const overlap =
    tokens.filter((t) => titleTokens.has(t)).length / Math.max(4, tokens.length);

  // Reward concrete numbers — fees, scores, ages, dates.
  const digits = (sentence.match(/\d/g) ?? []).length;
  const numeric = Math.min(digits / 4, 1.5);

  // Penalise pure quotes: they're colour, not information.
  const quoteChars = (sentence.match(QUOTE_RE) ?? []).length;
  const quotePenalty = quoteChars >= 2 ? 0.9 : 0;

  // Penalise sentences that are too short to say anything or too long to skim.
  const len = sentence.length;
  const lengthPenalty = len < 45 ? 1.0 : len > 320 ? 0.8 : 0;

  const fillerPenalty = FILLER_RE.test(sentence) ? 4 : 0;

  // A trailing sentence is usually a sign-off, not news.
  const tailPenalty = index >= totalSentences - 1 && totalSentences > 4 ? 0.6 : 0;

  return (
    position * 2.6 +
    salience * 1.4 +
    overlap * 1.8 +
    numeric * 1.2 -
    quotePenalty -
    lengthPenalty -
    fillerPenalty -
    tailPenalty
  );
}

function buildDocFreq(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    for (const token of new Set(tokenise(sentence))) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  // Normalise so long articles don't score higher than short ones.
  const max = Math.max(1, ...freq.values());
  for (const [token, count] of freq) freq.set(token, count / max);
  return freq;
}

/** Drops the "Reporter Name, Somewhere —" dateline some wires prepend. */
function stripDateline(sentence: string): string {
  return sentence.replace(/^[A-Z][A-Za-z .'-]{2,40}\s*[—–-]\s+/, '').trim();
}

function trimToLength(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (lastStop > maxChars * 0.55) return cut.slice(0, lastStop + 1).trim();
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
}

export function summariseExtractive(story: Summarisable): Summary {
  const body = normaliseWhitespace(story.body ?? '');
  const sentences = splitSentences(body).filter((s) => !FILLER_RE.test(s));
  const titleTokens = new Set(tokenise(story.title));

  const context: ScoringContext = {
    titleTokens,
    docFreq: buildDocFreq(sentences),
    totalSentences: sentences.length,
  };

  // The lede is the sentence that states the news — in news prose it is
  // essentially always the first substantial one. Anchor on it rather than
  // letting a number-dense sentence from deeper in the article outscore it and
  // leave the summary starting mid-argument.
  const ledeIndex = sentences.findIndex((s) => s.length >= 55);
  const lede = ledeIndex === -1 ? 0 : ledeIndex;

  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index, context) }))
    .filter((s) => Number.isFinite(s.score) && s.index !== lede)
    .sort((a, b) => b.score - a.score);

  const support = ranked[0];
  const picked = [
    { index: lede, sentence: stripDateline(sentences[lede] ?? '') },
    ...(support ? [support] : []),
  ]
    .filter((s) => s.sentence)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  // If the lede alone already spends the budget, a second sentence would only
  // get truncated mid-thought — better to show one complete sentence.
  const bottomLine =
    picked[0] && picked[0].length > MAX_SUMMARY_CHARS * 0.8
      ? trimToLength(picked[0], MAX_SUMMARY_CHARS)
      : trimToLength(picked.join(' '), MAX_SUMMARY_CHARS);

  const { headline, rewritten } = deBaitHeadline(story.title, sentences[lede] ?? '');

  // Tag and mine facts from the opening of the article only. Readability
  // sometimes keeps a related-links rail or nav, and a transfer roundup linked
  // in the sidebar shouldn't decide that an FA disciplinary story is about
  // transfers, or lend it someone else's fee.
  const article = body.slice(0, 1600);
  const haystack = `${story.title} ${article}`;

  // The competition gets a narrower window than the topic does, and the
  // headline counts for more than the lede. A story names the competition it
  // is about up front; one named deeper in the body is background, and reading
  // that far filed an MLS match report under La Liga because it recounted
  // Messi's Barcelona years.
  const competitionQuery = {
    title: story.title,
    lede: body.slice(0, 600),
    prefer: story.countries ?? [],
  };

  return {
    headline,
    headlineRewritten: rewritten,
    bottomLine: bottomLine || normaliseWhitespace(story.rssSummary).slice(0, 300),
    keyFacts: extractFacts(article, 4).map((f) => f.value),
    topic: classifyTopic(haystack),
    competition: classifyCompetition(competitionQuery),
    // Sentences are quoted verbatim, so the summary is in whatever language
    // the article was. The translation stage is what fixes that.
    language: story.language,
    translated: false,
    engine: 'extractive',
  };
}

export function summariseAllExtractive(
  stories: ClusteredStory[]
): SummarisedStory[] {
  return stories.map((story) => ({
    ...story,
    summary: summariseExtractive(story),
  }));
}
