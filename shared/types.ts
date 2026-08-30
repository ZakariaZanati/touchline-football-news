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
  clubs: string[];
  importance: number;
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

export interface Meta {
  lastUpdated: string | null;
  lastError: string | null;
  engine: SummaryEngine;
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
}

export interface RefreshResponse {
  ok: boolean;
  meta?: Meta;
  error?: string;
}
