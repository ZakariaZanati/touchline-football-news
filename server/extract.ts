import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import pLimit from 'p-limit';

import { config } from './config.ts';
import { errorMessage, isTimeout } from './errors.ts';
import { normaliseWhitespace } from './text.ts';
import type { ExtractedStory, FeedStory } from './types.ts';

/**
 * Article body extraction.
 *
 * The RSS description is usually one teaser sentence — not enough to say what
 * actually happened. So for each story we fetch the article page once and run
 * Mozilla's Readability over it to get just the prose, dropping nav, ads,
 * related-links rails and newsletter prompts.
 */

// jsdom logs a wall of "Could not parse CSS stylesheet" on real-world pages.
// We only want the DOM, so silence it.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

/** What one article page yielded, successfully or not. */
interface Extraction {
  body: string;
  byline: string | null;
  ok: boolean;
  error: string | null;
  /** A video page, gallery or link rail — there's no article in it. */
  stub: boolean;
}

const cache = new Map<string, { at: number; value: Extraction }>();

function cacheGet(url: string): Extraction | null {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > config.articleCacheMinutes * 60_000) {
    cache.delete(url);
    return null;
  }
  return hit.value;
}

function cacheSet(url: string, value: Extraction): void {
  cache.set(url, { at: Date.now(), value });
  // Keep the cache from growing unbounded on a long-running process.
  if (cache.size > 800) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [key] of oldest.slice(0, 200)) cache.delete(key);
  }
}

/** Boilerplate that survives Readability on some sites. */
const NOISE_LINES =
  /^(?:image source|image caption|getty images|advertisement|sign up|subscribe|read more|related|follow us|share this|this article|by\s+\w+\s+\w+$)/i;

/**
 * Sentence-level cruft embedded mid-prose, where a line filter can't reach:
 * player-widget notices, consent prompts, app plugs.
 */
const NOISE_SENTENCES = [
  // Publisher datelines Readability keeps, e.g. Sky's
  // "Transfer Wednesday 26 August 2026 13:39, UK".
  /\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\s+\d{1,2}:\d{2}\s*,?\s*(?:UK|BST|GMT)?/gi,
  /\b(?:Last updated|Published|Updated)\s*:?\s*[^.|]{0,60}?\d{1,2}:\d{2}[^.|]{0,20}/gi,
  // ESPN prepends an inline video card and a byline/timestamp before the
  // prose: "playNicol: Wirtz a 'passenger' (0:41)ESPN News ServicesAug 26,
  // 2026, 01:50 PM ET".
  /\bplay[A-Z][^()]{0,120}\(\d{1,2}:\d{2}\)/g,
  // No leading \b: these are glued to the preceding word with no boundary,
  // as in "ESPN News ServicesAug 26, 2026, 01:50 PM ET".
  /[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4},\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:ET|BST|GMT)?/g,
  /(?:ESPN(?:\s+News\s+Services|\s+Staff)?|Associated Press|Reuters|PA Media|PA Sport)(?=[A-Z])/g,
  // ESPN's author bio card: "Close Sam is a writer, broadcaster ... transfers."
  /\bClose\s+(?:[A-Z][a-z]+\s+){0,2}(?:is|are)\s+an?\s+[^.]{0,180}\.(?:\s*(?:He|She|They)\s+[^.]{0,180}\.)*/g,
  /Please use Chrome browser for a more accessible video player\.?/gi,
  /This (?:video|content) is (?:not available|unavailable)[^.]*\.?/gi,
  /(?:Watch|Stream) [^.]{0,60}\blive on\b[^.]{0,40}\.?/gi,
  /Sign up (?:to|for) [^.]{0,80}newsletter[^.]*\.?/gi,
  /(?:Download|Get) the [A-Z][^.]{0,40}app[^.]*\.?/gi,
  /Follow (?:us|[A-Z][\w ]{0,30}) on (?:X|Twitter|Facebook|Instagram)[^.]*\.?/gi,
  /All times (?:BST|GMT|UK)[^.]*\.?/gi,
];

/**
 * Reach plc titles (Mirror, football.london) glue a breadcrumb trail, a
 * standfirst and one or two timestamps in front of the prose with no
 * separators at all:
 *
 *   ChelseaChelsea NewsChelsea injury newsChelsea injury news ahead of Luton
 *   as Xabi Alonso provides double update13:40, 26 Aug 2026Updated 13:46,
 *   26 Aug 2026Xabi Alonso has provided the latest…
 *
 * There's no punctuation to split on, but the timestamp format is unmistakable
 * and the article always begins right after the last one.
 */
const REACH_STAMP = /\d{1,2}:\d{2},\s*\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}/g;

function dropPublisherPreamble(text: string): string {
  const head = text.slice(0, 450);
  let cutAt = -1;
  for (const match of head.matchAll(REACH_STAMP)) {
    cutAt = match.index + match[0].length;
  }
  return cutAt > 0 ? text.slice(cutAt).trimStart() : text;
}

/**
 * Function words. Their density is what separates English prose from a list.
 */
const FUNCTION_WORDS = new Set(
  `the a an and or but of in on at to for with from by is are was were be been
   has have had he she it they we you his her their this that as not will would
   can could there which who when after before over into`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Density of function words in a sample — the signal that separates English
 * prose from a list of links. Real reporting runs 0.30–0.37; BBC's global nav
 * ("Home News Sport Weather iPlayer…") and ESPN's author rail
 * ("9hRob Dawson9hESPN News Services11hPA…") both score ~0.
 *
 * Measuring the shape of the text rather than matching each publisher's markup
 * means this keeps working when their markup changes.
 */
function proseScore(sample: string): number {
  const tokens = sample
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length < 12) return 0;
  return tokens.filter((t) => FUNCTION_WORDS.has(t)).length / tokens.length;
}

const WINDOW = 300;
const PROSE_FLOOR = 0.15;

/**
 * Checked *after* trimToProse has had its go, so anything still failing here
 * had no article in it to find. Uses the same narrow window as the repair, so
 * a junk prefix can't be averaged out by good text further down.
 */
function looksLikeProse(text: string): boolean {
  return proseScore(text.slice(0, WINDOW)) >= PROSE_FLOOR;
}

/**
 * When Readability prepends a nav bar or link rail to an otherwise fine
 * article, the article is still in there — so slide forward to where the prose
 * actually starts instead of discarding the story.
 */
function trimToProse(text: string): string {
  if (proseScore(text.slice(0, WINDOW)) >= PROSE_FLOOR) return text;

  const limit = Math.min(text.length - WINDOW, 3000);
  for (let offset = 50; offset < limit; offset += 50) {
    if (proseScore(text.slice(offset, offset + WINDOW)) < 0.22) continue;

    // Snap forward to a sentence boundary so we don't start mid-word.
    const rest = text.slice(offset);
    const boundary = rest.search(/[.!?]\s+[A-Z]/);
    if (boundary !== -1 && boundary < 260) {
      return rest.slice(boundary + 1).trimStart();
    }
    const word = rest.search(/\s[A-Z]/);
    return word !== -1 && word < 120 ? rest.slice(word + 1) : rest;
  }

  return text;
}

/**
 * Removes the author's name where it's been glued to the front of the prose
 * ("Tim Vickery In recent years, Palmeiras have…").
 *
 * Uses the byline Readability already identified rather than guessing at
 * capitalised words, so a story that legitimately opens with someone's name
 * keeps it.
 */
function dropByline(text: string, byline: string | null | undefined): string {
  const name = normaliseWhitespace(byline ?? '')
    .replace(/^(?:by|words by)\s+/i, '')
    .split(/\s*[,|·-]\s*/)[0]; // "Tim Vickery, Sao Paulo" -> "Tim Vickery"

  if (name.length < 4 || name.length > 40) return text;
  if (!text.startsWith(name)) return text;

  return text.slice(name.length).replace(/^[\s,|·-]+/, '');
}

function cleanBody(text: string = '', byline: string = ''): string {
  let out = text
    // Zero-width joiners some CMSes sprinkle between paragraphs; they break
    // sentence splitting by gluing "round.‌It" together.
    .replace(/[​-‍﻿]/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !NOISE_LINES.test(line))
    .join('\n')
    // Readability keeps BBC's inline caption markers glued to the prose.
    .replace(/Image source,\s*[^.]{0,60}?Image caption,\s*/gi, ' ')
    .replace(/\bImage (?:source|caption),\s*/gi, ' ')
    .replace(/\bSkip to content\b/gi, ' ');

  for (const pattern of NOISE_SENTENCES) out = out.replace(pattern, ' ');

  out = normaliseWhitespace(out)
    // Readability joins paragraphs without a separator, gluing sentences into
    // "...from Manchester City.The Egypt forward...". Restore the space so the
    // sentence splitter can see the boundary.
    .replace(/([a-z0-9)"'’])([.!?])([A-Z])/g, '$1$2 $3');

  // Stripping the dateline out of "ESPN News ServicesAug 26, 2026, 1:50 PM ET"
  // leaves the wire credit behind, so peel any leading credits off in a loop
  // until real prose is at the front.
  const LEADING_CREDIT =
    /^(?:ESPN(?:\s+News\s+Services|\s+Staff)?|News\s+Services|Associated\s+Press|Reuters|PA\s+(?:Media|Sport)|Sky\s+Sports\s+News|Staff\s+(?:Writer|Reporter))[\s,|·-]*/;
  for (let i = 0; i < 4 && LEADING_CREDIT.test(out); i += 1) {
    out = out.replace(LEADING_CREDIT, '').trimStart();
  }

  return trimToProse(dropByline(dropPublisherPreamble(out), byline));
}

async function extractOne(story: FeedStory): Promise<Extraction> {
  const cached = cacheGet(story.url);
  if (cached) return cached;

  const result: Extraction = {
    body: '',
    byline: null,
    ok: false,
    error: null,
    stub: false,
  };

  try {
    const response = await fetch(story.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(config.articleTimeout),
      headers: {
        'user-agent': config.userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      cacheSet(story.url, result);
      return result;
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url: story.url, virtualConsole });
    const parsed = new Readability(dom.window.document, {
      charThreshold: 200,
    }).parse();
    dom.window.close();

    const byline = normaliseWhitespace(parsed?.byline ?? '');
    const body = cleanBody(parsed?.textContent ?? '', byline);
    if (body.length >= config.minBodyChars && looksLikeProse(body)) {
      result.body = body;
      result.byline = byline || null;
      result.ok = true;
    } else if (body.length >= config.minBodyChars) {
      // Long enough, but it's a nav bar or link rail rather than an article.
      result.error = 'not prose';
      result.stub = true;
    } else {
      // Almost always a video page or photo gallery whose "article" is a
      // one-line caption. There's no story here to compress.
      result.error = `stub (${body.length} chars)`;
      result.stub = true;
    }
  } catch (error) {
    result.error = isTimeout(error) ? 'timeout' : errorMessage(error);
  }

  cacheSet(story.url, result);
  return result;
}

/**
 * Extracts bodies for a list of stories. A story whose page can't be read
 * falls back to its RSS summary rather than being dropped — a short summary
 * still beats no story.
 */
export async function extractBodies(
  stories: FeedStory[]
): Promise<ExtractedStory[]> {
  const limit = pLimit(config.articleConcurrency);

  return Promise.all(
    stories.map((story) =>
      limit(async (): Promise<ExtractedStory> => {
        const { body, byline, ok, error, stub } = await extractOne(story);
        return {
          ...story,
          body: ok ? body : story.rssSummary,
          byline,
          bodySource: ok ? 'article' : 'rss',
          extractError: error,
          stub,
        };
      })
    )
  );
}
