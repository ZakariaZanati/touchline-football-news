import type { Source } from './types.ts';

/**
 * Feed registry.
 *
 * These are all publisher-provided RSS feeds — the sanctioned way to read a
 * site's headlines. We only fetch the article page itself afterwards, one
 * request per story, to pull the body text we summarise from.
 *
 * `trust` breaks ties when the same story is reported by several outlets: the
 * highest-trust member of a cluster becomes the one we summarise.
 */
export const SOURCES: Source[] = [
  // --- England / UK --------------------------------------------------------
  {
    id: 'bbc',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    trust: 1.0,
    country: 'england',
    language: 'en',
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/football/rss',
    trust: 0.95,
    country: 'england',
    language: 'en',
  },
  {
    id: 'sky',
    name: 'Sky Sports',
    // 11661 is the football desk. 12040 is Sky Sports News, which mixes in
    // darts, F1 and golf — don't use it here.
    url: 'https://www.skysports.com/rss/11661',
    trust: 0.9,
    country: 'england',
    language: 'en',
  },
  {
    id: 'espn',
    name: 'ESPN',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    trust: 0.85,
    country: 'england',
    language: 'en',
  },
  {
    id: 'telegraph',
    name: 'The Telegraph',
    url: 'https://www.telegraph.co.uk/football/rss.xml',
    trust: 0.8,
    country: 'england',
    language: 'en',
  },
  {
    id: 'independent',
    name: 'The Independent',
    url: 'https://www.independent.co.uk/sport/football/rss',
    trust: 0.75,
    country: 'england',
    language: 'en',
  },
  // --- Spain ---------------------------------------------------------------
  // Marca and AS lean Madrid, Mundo Deportivo and Sport lean Barcelona, so the
  // pair below is chosen for balance rather than for being the two biggest.
  // Football España is the English-language check on both.
  {
    id: 'footballespana',
    name: 'Football España',
    url: 'https://www.football-espana.net/feed',
    trust: 0.8,
    country: 'spain',
    language: 'en',
  },
  {
    id: 'marca',
    name: 'Marca',
    url: 'https://e00-marca.uecdn.es/rss/futbol/primera-division.xml',
    trust: 0.75,
    country: 'spain',
    language: 'es',
  },
  {
    id: 'mundodeportivo',
    name: 'Mundo Deportivo',
    url: 'https://www.mundodeportivo.com/feed/rss/futbol',
    trust: 0.6,
    country: 'spain',
    language: 'es',
  },
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
