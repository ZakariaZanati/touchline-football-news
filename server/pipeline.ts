import { config, summarizerEngine } from './config.ts';
import { errorMessage } from './errors.ts';
import { fetchAllFeeds } from './feeds.ts';
import { extractBodies } from './extract.ts';
import { clusterStories } from './cluster.ts';
import { summariseStories } from './summarize/index.ts';
import { isFootball } from './relevance.ts';
import { readSeconds } from './text.ts';
import type { FeedStory, SummarisedStory } from './types.ts';
import type { FeedStatus, Meta, Story } from '../shared/types.ts';

/**
 * The refresh pipeline:
 *
 *   feeds → dedupe → fetch article bodies → cluster duplicates → summarise
 *
 * Results are held in memory and served stale-while-revalidate, so a page load
 * never waits on a refresh that's already running.
 */

interface State extends Omit<Meta, 'storyCount' | 'refreshing' | 'refreshMinutes' | 'feeds'> {
  stories: Story[];
  feedStatus: FeedStatus[];
  /** The in-flight refresh, if one is running. */
  refreshing: Promise<Story[]> | null;
}

const state: State = {
  stories: [],
  feedStatus: [],
  lastUpdated: null,
  lastError: null,
  engine: summarizerEngine(),
  usage: null,
  warnings: [],
  refreshing: null,
  durationMs: null,
};

/**
 * Picks the `limit` stories to run the expensive stages over, round-robin
 * across outlets.
 *
 * Taking the globally-newest N instead would hand the whole page to whichever
 * outlet publishes most often — Sky posts several times an hour and would bury
 * everyone else. Round-robin gives each source its turn before any source gets
 * a second slot, so the feed stays broad and clustering has cross-source
 * duplicates to actually find.
 */
function selectFairly(items: FeedStory[], limit: number): FeedStory[] {
  const bySource = new Map<string, FeedStory[]>();
  for (const item of items) {
    const queue = bySource.get(item.sourceId);
    if (queue) queue.push(item);
    else bySource.set(item.sourceId, [item]);
  }

  const queues = [...bySource.values()]; // each already newest-first
  const picked: FeedStory[] = [];

  for (let round = 0; picked.length < limit; round += 1) {
    let tookAny = false;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      picked.push(queue[round]);
      tookAny = true;
      if (picked.length >= limit) break;
    }
    if (!tookAny) break;
  }

  return picked.sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Ranks stories for the default feed: recency, with a nudge for importance. */
function rank(story: SummarisedStory): number {
  const ageHours = (Date.now() - story.publishedAt) / 3600_000;
  const recency = Math.exp(-ageHours / 9);
  const importance = ((story.summary.importance ?? 3) - 3) * 0.06;
  const corroboration = Math.min(story.sourceCount - 1, 4) * 0.03;
  return recency + importance + corroboration;
}

/** Shapes an internal story into the object the client consumes. */
function toPublic(story: SummarisedStory): Story {
  const { summary } = story;
  return {
    id: story.id,
    headline: summary.headline,
    headlineRewritten: summary.headlineRewritten,
    originalHeadline: story.title,
    bottomLine: summary.bottomLine,
    keyFacts: summary.keyFacts ?? [],
    topic: summary.topic,
    competition: summary.competition ?? null,
    clubs: summary.clubs ?? [],
    importance: summary.importance ?? 3,
    publishedAt: new Date(story.publishedAt).toISOString(),
    url: story.url,
    image: story.image,
    sourceId: story.sourceId,
    sourceName: story.sourceName,
    sourceCount: story.sourceCount,
    coverage: story.coverage.map((c) => ({
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      url: c.url,
      title: c.title,
    })),
    savedSeconds: Math.max(
      0,
      readSeconds(story.body ?? '') - readSeconds(summary.bottomLine)
    ),
    engine: summary.engine,
  };
}

async function runPipeline(): Promise<Story[]> {
  const startedAt = Date.now();
  const warnings: string[] = [];

  const { items, feedStatus } = await fetchAllFeeds();
  for (const feed of feedStatus) {
    if (!feed.ok) warnings.push(`${feed.name}: ${feed.error}`);
  }

  if (!items.length) {
    throw new Error('every feed failed or returned nothing');
  }

  // Cap the work before the expensive stages, spreading the budget over
  // outlets rather than letting the busiest one fill it.
  const candidates = selectFairly(items, config.maxStories);
  const extracted = await extractBodies(candidates);

  const failedExtracts = extracted.filter((s) => s.bodySource === 'rss').length;
  if (failedExtracts) {
    warnings.push(
      `${failedExtracts}/${extracted.length} articles fell back to their RSS summary`
    );
  }

  // Drop video stubs and galleries, then re-check relevance now that we have
  // the body — a headline alone is often too thin to tell football from golf.
  const withBodies = extracted.filter(
    (s) => !s.stub && isFootball(s.title, s.body)
  );
  const dropped = extracted.length - withBodies.length;
  if (dropped) warnings.push(`${dropped} stub/off-topic stories filtered out`);

  const clustered = clusterStories(withBodies);
  const { stories, engine, usage, errors } = await summariseStories(clustered);
  warnings.push(...errors.map((e) => `summariser: ${e}`));

  const ranked = stories
    .filter((s) => s.summary.bottomLine)
    .sort((a, b) => rank(b) - rank(a))
    .map(toPublic);

  state.stories = ranked;
  state.feedStatus = feedStatus;
  state.lastUpdated = new Date().toISOString();
  state.lastError = null;
  state.engine = engine;
  state.usage = usage;
  state.warnings = warnings;
  state.durationMs = Date.now() - startedAt;

  return ranked;
}

/**
 * Refreshes at most once at a time. Concurrent callers share the in-flight run
 * rather than starting a second scrape of every source.
 */
export function refresh({ force = false } = {}): Promise<Story[]> {
  if (state.refreshing) return state.refreshing;

  const isFresh =
    state.lastUpdated &&
    Date.now() - Date.parse(state.lastUpdated) < config.refreshMinutes * 60_000;
  if (isFresh && !force) return Promise.resolve(state.stories);

  state.refreshing = runPipeline()
    .catch((error: unknown) => {
      state.lastError = errorMessage(error);
      // Keep serving the previous snapshot if we have one.
      return state.stories;
    })
    .finally(() => {
      state.refreshing = null;
    });

  return state.refreshing;
}

/** Returns cached stories immediately, kicking off a refresh if stale. */
export async function getStories(): Promise<Story[]> {
  if (!state.lastUpdated) return refresh();

  const isStale =
    Date.now() - Date.parse(state.lastUpdated) >= config.refreshMinutes * 60_000;
  if (isStale) refresh(); // fire and forget — serve what we have now

  return state.stories;
}

export function getMeta(): Meta {
  return {
    lastUpdated: state.lastUpdated,
    lastError: state.lastError,
    engine: state.engine,
    storyCount: state.stories.length,
    refreshing: state.refreshing !== null,
    refreshMinutes: config.refreshMinutes,
    durationMs: state.durationMs,
    warnings: state.warnings,
    usage: state.usage,
    feeds: state.feedStatus,
  };
}

export function startBackgroundRefresh(): NodeJS.Timeout {
  refresh({ force: true });
  const timer = setInterval(
    () => refresh({ force: true }),
    config.refreshMinutes * 60_000
  );
  timer.unref?.();
  return timer;
}
