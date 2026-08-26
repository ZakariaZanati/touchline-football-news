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
export const SOURCES = [
  {
    id: 'bbc',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    trust: 1.0,
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/football/rss',
    trust: 0.95,
  },
  {
    id: 'sky',
    name: 'Sky Sports',
    // 11661 is the football desk. 12040 is Sky Sports News, which mixes in
    // darts, F1 and golf — don't use it here.
    url: 'https://www.skysports.com/rss/11661',
    trust: 0.9,
  },
  {
    id: 'espn',
    name: 'ESPN',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    trust: 0.85,
  },
  {
    id: 'telegraph',
    name: 'The Telegraph',
    url: 'https://www.telegraph.co.uk/football/rss.xml',
    trust: 0.8,
  },
  {
    id: 'independent',
    name: 'The Independent',
    url: 'https://www.independent.co.uk/sport/football/rss',
    trust: 0.75,
  },
  {
    id: 'footballlondon',
    name: 'football.london',
    url: 'https://www.football.london/?service=rss',
    trust: 0.6,
  },
  {
    id: 'mirror',
    name: 'Mirror Football',
    url: 'https://www.mirror.co.uk/sport/football/?service=rss',
    trust: 0.45,
  },
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
