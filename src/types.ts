/**
 * Client-only types. Everything that crosses the network lives in
 * `shared/types.ts` and is imported from there.
 */
import type { TopicId } from '../shared/types.ts';

/** The topic tabs, plus the unfiltered default. */
export type TopicFilter = TopicId | 'all';

/** The active feed filters. `source` is a source id, or 'all'. */
export interface Filters {
  topic: TopicFilter;
  source: string;
  q: string;
}
