import 'dotenv/config';

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: int(process.env.PORT, 8787),

  // How far back a story can be published and still show up.
  maxAgeHours: int(process.env.MAX_AGE_HOURS, 30),

  // Upper bound on stories we run the full extract+summarise pipeline over.
  // Kept generous on purpose: cross-source clustering can only group coverage
  // it can see, so a thin per-source sample leaves duplicates unmerged.
  maxStories: int(process.env.MAX_STORIES, 90),

  // Background refresh interval.
  refreshMinutes: int(process.env.REFRESH_MINUTES, 15),

  // Parallelism for outbound fetches. Keep modest — we're a polite client.
  feedConcurrency: int(process.env.FEED_CONCURRENCY, 6),
  articleConcurrency: int(process.env.ARTICLE_CONCURRENCY, 5),

  // Per-request timeouts (ms).
  feedTimeout: int(process.env.FEED_TIMEOUT_MS, 12000),
  articleTimeout: int(process.env.ARTICLE_TIMEOUT_MS, 12000),

  // Article body cache TTL — article text doesn't change, so this can be long.
  articleCacheMinutes: int(process.env.ARTICLE_CACHE_MINUTES, 360),

  // Identify honestly. This isn't only good manners — several publishers'
  // bot protection returns an empty HTTP 202 for a spoofed desktop-Chrome UA
  // that plainly isn't a browser, while serving a declared feed reader fine.
  userAgent:
    process.env.USER_AGENT ??
    'FootballNewsBot/0.1 (+https://github.com/local/football-news; summarises headlines)',

  // Extracted bodies shorter than this are video stubs or photo galleries —
  // there's no story in them to compress.
  minBodyChars: int(process.env.MIN_BODY_CHARS, 420),

  // --- Summarisation -------------------------------------------------------
  // 'auto'       → use Claude when ANTHROPIC_API_KEY is set, else extractive
  // 'extractive' → always use the local, zero-dependency summariser
  // 'claude'     → always use Claude (errors loudly if no key)
  summarizer: process.env.SUMMARIZER ?? 'auto',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',

  // Stories per Claude request. Batching is what keeps this cheap: one call
  // summarises many articles instead of one call each.
  claudeBatchSize: int(process.env.CLAUDE_BATCH_SIZE, 8),

  // Characters of article body sent to Claude per story. News is inverted
  // pyramid — the first ~2500 chars carry essentially all the facts.
  claudeBodyChars: int(process.env.CLAUDE_BODY_CHARS, 2500),
};

export function summarizerEngine() {
  if (config.summarizer === 'extractive') return 'extractive';
  if (config.summarizer === 'claude') return 'claude';
  return config.anthropicApiKey ? 'claude' : 'extractive';
}
