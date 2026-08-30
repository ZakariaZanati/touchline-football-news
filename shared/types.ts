/**
 * The wire contract between the API and the browser.
 *
 * Both `tsconfig.app.json` and `tsconfig.node.json` include this file, so a
 * change to a response shape fails the build on whichever side hasn't caught
 * up — which is the main thing TypeScript buys a project split across a
 * network boundary.
 *
 * Types only: every import of this module is erased at build time.
 */

/** Story categories. The server's `TOPICS` registry implements this union. */
export type TopicId =
  | 'transfer'
  | 'match'
  | 'injury'
  | 'manager'
  | 'offfield'
  | 'club'
  | 'other';

export interface Topic {
  id: TopicId;
  label: string;
}

/**
 * Languages the text pipeline understands. Every stage that scores or splits
 * prose is keyed on this — see `server/language.ts`.
 */
export type Language = 'en' | 'es';

/** Countries whose football the club registry can recognise. */
export type CountryId =
  | 'england'
  | 'spain'
  | 'scotland'
  | 'italy'
  | 'germany'
  | 'france'
  | 'portugal'
  | 'netherlands';

export interface Country {
  id: CountryId;
  label: string;
}

/** A club a story is about, resolved against the registry. */
export interface ClubRef {
  id: string;
  name: string;
  country: CountryId;
}

/** One outlet's report of a story, within a cluster. */
export interface Coverage {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
}

/** A story as the client consumes it. */
export interface Story {
  id: string;
  headline: string;
  headlineRewritten: boolean;
  originalHeadline: string;
  bottomLine: string;
  keyFacts: string[];
  topic: TopicId;
  competition: string | null;
  /** Clubs detected in the story, resolved against the registry. */
  clubs: ClubRef[];
  /** Countries this story's football belongs to, from its clubs and competition. */
  countries: CountryId[];
  importance: number;
  /** The language the summary is written in — always 'en' once translated. */
  language: Language;
  /** True when the summary was translated out of its source language. */
  translated: boolean;
  /** The article's own language, which may differ from `language`. */
  sourceLanguage: Language;
  /** ISO 8601. */
  publishedAt: string;
  url: string;
  image: string | null;
  sourceId: string;
  sourceName: string;
  sourceCount: number;
  coverage: Coverage[];
  /** Reading time saved versus the full article, in seconds. */
  savedSeconds: number;
  engine: SummaryEngine;
}

export type SummaryEngine = 'claude' | 'extractive';

export interface FeedStatus {
  id: string;
  name: string;
  count: number;
  ok: boolean;
  error: string | null;
}

/** Token accounting for a refresh, when Claude produced the summaries. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type TranslatorEngine = 'claude' | 'none';

export interface Meta {
  lastUpdated: string | null;
  lastError: string | null;
  engine: SummaryEngine;
  /** How non-English summaries are brought into English, if at all. */
  translator: TranslatorEngine;
  /** Stories still showing in their source language because no translator ran. */
  untranslated: number;
  storyCount: number;
  refreshing: boolean;
  refreshMinutes: number;
  durationMs: number | null;
  warnings: string[];
  usage: TokenUsage | null;
  feeds: FeedStatus[];
}

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  country: CountryId;
  language: Language;
}

/** A club the feed can be filtered by. */
export interface ClubInfo {
  id: string;
  name: string;
  country: CountryId;
}

// --- Endpoint responses ----------------------------------------------------

export interface NewsResponse {
  stories: Story[];
  total: number;
  meta: Meta;
}

export interface SourcesResponse {
  sources: SourceInfo[];
  topics: Topic[];
  countries: Country[];
  clubs: ClubInfo[];
}

export interface RefreshResponse {
  ok: boolean;
  meta?: Meta;
  error?: string;
}
