/**
 * Client-only types. Everything that crosses the network lives in
 * `shared/types.ts` and is imported from there.
 */
import type { TopicId } from '../shared/types.ts';

/** The topic tabs, plus the unfiltered default. */
export type TopicFilter = TopicId | 'all';

/**
 * The active feed filters. `source`, `country` and `club` are registry ids,
 * or 'all'.
 *
 * `source` is the outlet; `country` and `club` describe the football itself,
 * so a Guardian story about Real Madrid matches country=spain.
 */
export interface Filters {
  topic: TopicFilter;
  source: string;
  country: string;
  club: string;
  q: string;
}
