/**
 * Internal pipeline types.
 *
 * Each stage widens the story object — feed item, then extracted body, then
 * cluster, then summary — so the types are written as a chain of `extends`.
 * That way a function that runs after extraction can't be handed a story that
 * hasn't been through it.
 *
 * The shapes the *client* sees live in `shared/types.ts`.
 */
import type {
  ClubRef,
  CountryId,
  Coverage,
  Language,
  SummaryEngine,
  TopicId,
} from '../shared/types.ts';

export interface Source {
  id: string;
  name: string;
  url: string;
  /** Breaks ties when several outlets report the same story. */
  trust: number;
  /** Where the outlet is based — not necessarily what it writes about. */
  country: CountryId;
  /** The language its articles are in. Used as a fallback when extraction fails. */
  language: Language;
}

/** A story as it comes off a feed, before the article page is fetched. */
export interface FeedStory {
  id: string;
  url: string;
  sourceId: string;
  sourceName: string;
  trust: number;
  title: string;
  rssSummary: string;
  /** Epoch milliseconds. */
  publishedAt: number;
  image: string | null;
  categories: string[];
  unsummarisable: boolean;
  /** Inherited from the feed; replaced by detection once a body is extracted. */
  language: Language;
}

/** A feed story with the article body attached, or its RSS summary as backup. */
export interface ExtractedStory extends FeedStory {
  body: string;
  byline: string | null;
  bodySource: 'article' | 'rss';
  extractError: string | null;
  stub: boolean;
}

/** A story with its clubs and countries resolved against the registry. */
export interface TaggedStory extends ExtractedStory {
  clubs: ClubRef[];
  countries: CountryId[];
}

/** Coverage carries a timestamp internally; the client doesn't need it. */
export interface ClusterCoverage extends Coverage {
  publishedAt: number;
}

/** The representative story for a cluster of reports about the same event. */
export interface ClusteredStory extends TaggedStory {
  coverage: ClusterCoverage[];
  sourceCount: number;
}

/**
 * A finished summary. `clubs` and `importance` are optional because only the
 * Claude engine produces them — the extractive one has no way to judge either.
 */
export interface Summary {
  headline: string;
  headlineRewritten: boolean;
  bottomLine: string;
  keyFacts: string[];
  topic: TopicId;
  competition: string | null;
  importance?: number;
  engine: SummaryEngine;
  /** The language the summary text is written in. */
  language: Language;
  /** True once a translator has rewritten it out of its source language. */
  translated: boolean;
}

export interface SummarisedStory extends ClusteredStory {
  summary: Summary;
}
