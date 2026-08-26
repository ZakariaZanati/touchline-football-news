import Parser from 'rss-parser';
import pLimit from 'p-limit';
import crypto from 'node:crypto';

import { config } from './config.js';
import { SOURCES } from './sources.js';
import { isFootball } from './relevance.js';
import { stripHtml, normaliseWhitespace } from './text.js';

const parser = new Parser({
  timeout: config.feedTimeout,
  headers: {
    'user-agent': config.userAgent,
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
  },
});

function stableId(link) {
  return crypto.createHash('sha1').update(link).digest('hex').slice(0, 16);
}

/** Strip tracking params so the same article from two feeds dedupes cleanly. */
function canonicalUrl(rawLink) {
  try {
    const url = new URL(rawLink);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ito|ns_|at_|CMP$|cmpid)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return rawLink;
  }
}

function pickImage(item) {
  const candidates = [
    item.enclosure?.url,
    ...(item.mediaContent ?? []).map((m) => m?.$?.url),
    ...(item.mediaThumbnail ?? []).map((m) => m?.$?.url),
  ].filter(Boolean);

  const image = candidates.find((u) => /^https?:\/\//i.test(u));
  return image ?? null;
}

function parseDate(item) {
  const raw = item.isoDate ?? item.pubDate ?? item.date;
  const ts = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(ts) ? ts : Date.now();
}

function categoriesOf(item) {
  const raw = item.categories ?? [];
  return raw
    .map((c) => (typeof c === 'string' ? c : c?._ ?? c?.$?.term ?? ''))
    .map((c) => normaliseWhitespace(c))
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Formats that can't be summarised into "here is what happened".
 *
 * Live blogs are a running commentary with no settled outcome — and their
 * page changes under us between refreshes. Video pages and galleries have a
 * caption where the article should be. Paper round-ups are aggregated rumour,
 * which is the opposite of what this app is for.
 */
function isUnsummarisable(item, link) {
  const title = item.title ?? '';

  const liveBlog =
    /\/live\//i.test(link) ||
    /\blive[_-]blog\b/i.test(link) ||
    // Publishers signpost live coverage with a shouted LIVE in the headline:
    // "Tottenham vs Charlton LIVE:", "Transfer Centre LIVE!"
    /\bLIVE\b/.test(title) ||
    /\blive\b[^.]{0,30}\b(?:blog|updates?|reaction|coverage|commentary)\b/i.test(title) ||
    /[–—-]\s*live\s*$/i.test(title);

  const videoOrGallery =
    // Includes audio: BBC syndicates Sounds episodes (/sounds/play/…) into the
    // football feed, and a podcast page has a player where the article goes.
    /\/(?:video|videos|watch|gallery|in-pictures|podcast|podcasts|sounds|programmes|audio|listen)\//i.test(
      link
    ) ||
    // Sky's video titles: "'Energy and aggression!' | What will Baleba bring?"
    /^\s*['"“‘][^'"”’]{3,}['"”’]\s*\|/.test(title) ||
    /^(?:watch|video|in pictures|gallery|podcast)\s*[:|]/i.test(title);

  const roundUp =
    /^(?:papers?|gossip|paper talk|rumour(?:s| mill)|transfer round-?up)\s*[:|]/i.test(title);

  // SEO listings that exist to rank for a search, not to report anything:
  // "What TV channel is X on?", "How to watch", "Predicted line-ups".
  const seoListing =
    /\b(?:what (?:tv )?channel|how to watch|what time (?:is|does)|where to watch|live stream(?:ing)? (?:details|info)|predicted (?:line-?ups?|xi)|team news and predicted|kick-?off time and)\b/i.test(
      title
    );

  return liveBlog || videoOrGallery || roundUp || seoListing;
}

async function fetchSource(source) {
  const feed = await parser.parseURL(source.url);
  const cutoff = Date.now() - config.maxAgeHours * 3600_000;

  return (feed.items ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => {
      const link = canonicalUrl(item.link);
      return {
        id: stableId(link),
        url: link,
        sourceId: source.id,
        sourceName: source.name,
        trust: source.trust,
        title: normaliseWhitespace(item.title),
        rssSummary: stripHtml(
          item.contentSnippet ?? item.content ?? item.summary ?? ''
        ).slice(0, 900),
        publishedAt: parseDate(item),
        image: pickImage(item),
        categories: categoriesOf(item),
        unsummarisable: isUnsummarisable(item, link),
      };
    })
    .filter(
      (item) =>
        item.publishedAt >= cutoff &&
        !item.unsummarisable &&
        isFootball(item.title, item.rssSummary, item.categories.join(' '))
    );
}

/**
 * Fetches every registered feed. One bad feed never fails the batch — its
 * error is reported alongside the items we did get.
 */
export async function fetchAllFeeds() {
  const limit = pLimit(config.feedConcurrency);

  const settled = await Promise.all(
    SOURCES.map((source) =>
      limit(async () => {
        try {
          const items = await fetchSource(source);
          return { source, items, error: null };
        } catch (error) {
          return { source, items: [], error: error.message };
        }
      })
    )
  );

  // Same URL can appear in more than one feed — keep the highest-trust copy.
  const byUrl = new Map();
  for (const { items } of settled) {
    for (const item of items) {
      const existing = byUrl.get(item.url);
      if (!existing || item.trust > existing.trust) byUrl.set(item.url, item);
    }
  }

  const items = [...byUrl.values()].sort((a, b) => b.publishedAt - a.publishedAt);

  return {
    items,
    feedStatus: settled.map(({ source, items: got, error }) => ({
      id: source.id,
      name: source.name,
      count: got.length,
      ok: error === null,
      error,
    })),
  };
}
