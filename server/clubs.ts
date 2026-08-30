/**
 * Club registry.
 *
 * One source of truth for three things that were previously guessed
 * separately: which clubs a story is about, which country's football that
 * makes it, and whether a story is about football at all — `relevance.ts`
 * builds its club pattern from this list rather than keeping its own copy.
 *
 * `match` is tested against folded, lower-cased text, so entries are written
 * without accents: "atletico", never "Atlético". Aliases exist because outlets
 * are wildly inconsistent — Spurs/Tottenham, Man Utd/Manchester United — and
 * because the Spanish press drops the full name after first mention and writes
 * "el Madrid", "el Barca", "los blancos".
 */
import type { ClubRef, Country, CountryId } from '../shared/types.ts';
import { foldAccents } from './text.ts';

export const COUNTRIES: Country[] = [
  { id: 'england', label: 'England' },
  { id: 'spain', label: 'Spain' },
  { id: 'scotland', label: 'Scotland' },
  { id: 'italy', label: 'Italy' },
  { id: 'germany', label: 'Germany' },
  { id: 'france', label: 'France' },
  { id: 'portugal', label: 'Portugal' },
  { id: 'netherlands', label: 'Netherlands' },
];

export interface Club {
  id: string;
  name: string;
  country: CountryId;
  /** Alternatives for the same club, as a regex body. Accent-free. */
  match: string;
}

/**
 * The clubs worth filtering by. Not exhaustive — a story about a club that is
 * not listed still runs through the pipeline, it just carries no club tag.
 */
export const CLUBS: Club[] = [
  // --- England -------------------------------------------------------------
  { id: 'arsenal', name: 'Arsenal', country: 'england', match: 'arsenal|gunners' },
  { id: 'aston-villa', name: 'Aston Villa', country: 'england', match: 'aston villa' },
  { id: 'bournemouth', name: 'Bournemouth', country: 'england', match: 'bournemouth' },
  { id: 'brentford', name: 'Brentford', country: 'england', match: 'brentford' },
  { id: 'brighton', name: 'Brighton', country: 'england', match: 'brighton' },
  { id: 'burnley', name: 'Burnley', country: 'england', match: 'burnley' },
  { id: 'chelsea', name: 'Chelsea', country: 'england', match: 'chelsea' },
  { id: 'crystal-palace', name: 'Crystal Palace', country: 'england', match: 'crystal palace' },
  { id: 'everton', name: 'Everton', country: 'england', match: 'everton' },
  { id: 'fulham', name: 'Fulham', country: 'england', match: 'fulham' },
  { id: 'leeds', name: 'Leeds', country: 'england', match: 'leeds' },
  { id: 'leicester', name: 'Leicester', country: 'england', match: 'leicester' },
  { id: 'liverpool', name: 'Liverpool', country: 'england', match: 'liverpool' },
  { id: 'man-city', name: 'Manchester City', country: 'england', match: 'man(?:chester)? city' },
  { id: 'man-utd', name: 'Manchester United', country: 'england', match: 'man(?:chester)? (?:utd|united)' },
  { id: 'newcastle', name: 'Newcastle', country: 'england', match: 'newcastle' },
  { id: 'forest', name: 'Nottingham Forest', country: 'england', match: 'nott(?:ingham|s)? forest' },
  { id: 'southampton', name: 'Southampton', country: 'england', match: 'southampton' },
  { id: 'sunderland', name: 'Sunderland', country: 'england', match: 'sunderland' },
  { id: 'tottenham', name: 'Tottenham', country: 'england', match: 'tottenham|spurs' },
  { id: 'west-ham', name: 'West Ham', country: 'england', match: 'west ham' },
  { id: 'wolves', name: 'Wolves', country: 'england', match: 'wolves|wolverhampton' },

  // --- Spain ---------------------------------------------------------------
  { id: 'real-madrid', name: 'Real Madrid', country: 'spain', match: 'real madrid|el madrid|los blancos|merengues' },
  { id: 'barcelona', name: 'Barcelona', country: 'spain', match: 'barcelona|barca|blaugrana|culers' },
  { id: 'atletico', name: 'Atlético Madrid', country: 'spain', match: 'atletico(?: de)?(?: madrid)?|atleti|colchoneros|rojiblancos' },
  { id: 'sevilla', name: 'Sevilla', country: 'spain', match: 'sevilla' },
  { id: 'real-betis', name: 'Real Betis', country: 'spain', match: '(?:real )?betis|verdiblancos' },
  { id: 'valencia', name: 'Valencia', country: 'spain', match: 'valencia' },
  { id: 'villarreal', name: 'Villarreal', country: 'spain', match: 'villarreal|submarino amarillo' },
  { id: 'athletic', name: 'Athletic Club', country: 'spain', match: 'athletic(?: club)?(?: de)?(?: bilbao)?' },
  { id: 'real-sociedad', name: 'Real Sociedad', country: 'spain', match: 'real sociedad|la real' },
  { id: 'celta', name: 'Celta Vigo', country: 'spain', match: 'celta(?: de)?(?: vigo)?' },
  { id: 'espanyol', name: 'Espanyol', country: 'spain', match: 'espanyol|periquitos' },
  { id: 'girona', name: 'Girona', country: 'spain', match: 'girona' },
  { id: 'osasuna', name: 'Osasuna', country: 'spain', match: 'osasuna' },
  { id: 'rayo', name: 'Rayo Vallecano', country: 'spain', match: 'rayo(?: vallecano)?' },
  { id: 'mallorca', name: 'Mallorca', country: 'spain', match: 'mallorca' },
  { id: 'getafe', name: 'Getafe', country: 'spain', match: 'getafe' },
  { id: 'alaves', name: 'Alavés', country: 'spain', match: '(?:deportivo )?alaves' },
  { id: 'las-palmas', name: 'Las Palmas', country: 'spain', match: 'las palmas' },
  { id: 'valladolid', name: 'Valladolid', country: 'spain', match: 'valladolid' },
  { id: 'levante', name: 'Levante', country: 'spain', match: 'levante' },
  { id: 'elche', name: 'Elche', country: 'spain', match: 'elche' },
  { id: 'oviedo', name: 'Real Oviedo', country: 'spain', match: 'real oviedo' },

  // --- Elsewhere in Europe -------------------------------------------------
  { id: 'celtic', name: 'Celtic', country: 'scotland', match: 'celtic' },
  { id: 'rangers', name: 'Rangers', country: 'scotland', match: 'rangers' },
  { id: 'juventus', name: 'Juventus', country: 'italy', match: 'juventus|juve' },
  { id: 'inter', name: 'Inter Milan', country: 'italy', match: 'inter milan|internazionale' },
  { id: 'ac-milan', name: 'AC Milan', country: 'italy', match: 'ac milan' },
  { id: 'napoli', name: 'Napoli', country: 'italy', match: 'napoli' },
  { id: 'roma', name: 'Roma', country: 'italy', match: 'as roma|la roma' },
  { id: 'lazio', name: 'Lazio', country: 'italy', match: 'lazio' },
  { id: 'bayern', name: 'Bayern Munich', country: 'germany', match: 'bayern' },
  { id: 'dortmund', name: 'Borussia Dortmund', country: 'germany', match: 'dortmund' },
  { id: 'leipzig', name: 'RB Leipzig', country: 'germany', match: 'leipzig' },
  { id: 'psg', name: 'Paris Saint-Germain', country: 'france', match: 'psg|paris saint-?germain' },
  { id: 'marseille', name: 'Marseille', country: 'france', match: 'marseille' },
  { id: 'lyon', name: 'Lyon', country: 'france', match: 'lyon' },
  { id: 'monaco', name: 'Monaco', country: 'france', match: 'monaco' },
  { id: 'lille', name: 'Lille', country: 'france', match: 'lille' },
  { id: 'porto', name: 'Porto', country: 'portugal', match: 'porto' },
  { id: 'benfica', name: 'Benfica', country: 'portugal', match: 'benfica' },
  { id: 'sporting', name: 'Sporting CP', country: 'portugal', match: 'sporting(?: cp| lisbon)?' },
  { id: 'ajax', name: 'Ajax', country: 'netherlands', match: 'ajax' },
  { id: 'psv', name: 'PSV', country: 'netherlands', match: 'psv' },
  { id: 'feyenoord', name: 'Feyenoord', country: 'netherlands', match: 'feyenoord' },
];

/**
 * One alternation over every club, for the relevance gate. Built here so that
 * a club added above is recognised as football vocabulary for free.
 */
export const CLUB_PATTERN = new RegExp(
  `\\b(?:${CLUBS.map((c) => c.match).join('|')})\\b`,
  'i'
);

/**
 * Anchored club names, for stripping a section label glued to the front of an
 * article body. Accent folding preserves length, so a match length here can be
 * used to slice the unfolded original.
 *
 * The "is it glued?" check deliberately lives in the caller rather than as a
 * `(?=[A-Z])` lookahead: this pattern needs the `i` flag to match "Atletico"
 * from a lowercase entry, and under `i` a character class of `[A-Z]` matches
 * lowercase too — which silently turned "Atlético Madrid…" into "co Madrid…".
 */
export const SECTION_LABEL = new RegExp(
  `^(?:${CLUBS.map((c) => c.match).join('|')})`,
  'i'
);

/** Per-club matchers, compiled once. */
const MATCHERS: { club: Club; re: RegExp }[] = CLUBS.map((club) => ({
  club,
  re: new RegExp(`\\b(?:${club.match})\\b`, 'gi'),
}));

/** How much of the body counts as the lede, for club detection. */
const LEDE_CHARS = 600;

const countIn = (haystack: string, re: RegExp): number => {
  re.lastIndex = 0;
  return (haystack.match(re) ?? []).length;
};

/**
 * Finds the clubs a story is *about* — which is not the same as the clubs it
 * mentions, and the difference matters because these tags drive a filter.
 *
 * News headlines name their subject, so a club in the title is taken as
 * definitive. Failing that, only the lede is searched, and a club needs to
 * appear twice in it to count. Searching the whole body instead filed "Messi
 * scores 4 as Inter Miami net 7" under Barcelona, because a Messi story
 * inevitably recounts his career; a career mention is background, not subject.
 *
 * Capped at `limit`, because a transfer round-up name-checks a dozen clubs in
 * passing and tagging every one would make the filter useless.
 */
export function detectClubs(title: string, body = '', limit = 3): ClubRef[] {
  const inTitle = foldAccents(title).toLowerCase();
  const inLede = foldAccents(body.slice(0, LEDE_CHARS)).toLowerCase();

  const hits: { club: Club; score: number }[] = [];
  for (const { club, re } of MATCHERS) {
    const titleHits = countIn(inTitle, re);
    const ledeHits = countIn(inLede, re);
    if (!titleHits && ledeHits < 2) continue;
    hits.push({ club, score: titleHits * 5 + ledeHits });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ club }) => ({ id: club.id, name: club.name, country: club.country }));
}

/** The countries a set of clubs implies, in registry order, deduplicated. */
export function countriesOf(clubs: ClubRef[]): CountryId[] {
  const seen = new Set(clubs.map((c) => c.country));
  return COUNTRIES.filter((c) => seen.has(c.id)).map((c) => c.id);
}
