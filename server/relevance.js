/**
 * Football relevance gate.
 *
 * Even feeds published under a "football" URL leak — outlets syndicate a darts
 * final or an F1 grid penalty into the same channel. One tennis card in a
 * football feed is the kind of noise this app is supposed to be free of, so we
 * check every story rather than trusting the feed's label.
 */

const FOOTBALL_TERMS =
  /\b(?:football|footballer|premier league|champions league|europa league|conference league|la ?liga|serie a|bundesliga|ligue 1|eredivisie|fa cup|carabao cup|league cup|efl|uefa|fifa|world cup|nations league|transfer window|striker|midfielder|defender|goalkeeper|winger|centre-back|full-back|penalty box|offside|var\b|matchday|kick-?off|clean sheet|hat-?trick|substitute|caps?\b|loan (?:deal|move|spell)|manager|head coach|squad|dressing room|touchline|free-?kick|corner kick|extra time|group stage|relegation|promotion|derby)\b/i;

const CLUBS =
  /\b(?:arsenal|aston villa|bournemouth|brentford|brighton|burnley|chelsea|crystal palace|everton|fulham|leeds|leicester|liverpool|man(?:chester)? city|man(?:chester)? utd|manchester united|newcastle|nott(?:ingham|s)? forest|sheffield|southampton|sunderland|tottenham|spurs|west ham|west brom|wolves|celtic|rangers|barcelona|real madrid|atletico|sevilla|valencia|bayern|dortmund|leipzig|juventus|inter milan|ac milan|napoli|roma|lazio|psg|marseille|lyon|monaco|lille|ajax|psv|feyenoord|porto|benfica|sporting)\b/i;

const OTHER_SPORTS =
  /\b(?:darts|snooker|formula ?1|f1\b|grand prix|motogp|golf|pga|liv golf|ryder cup|solheim cup|tennis|wimbledon|atp\b|wta\b|boxing|heavyweight|ufc|mma\b|cricket|test match|the ashes|ipl\b|rugby|six nations|nfl\b|nba\b|mlb\b|nhl\b|cycling|tour de france|athletics|olympic|swimming|horse racing|cheltenham|grand national|netball|hockey)\b/i;

/**
 * Returns true when the text is about football.
 *
 * A story only fails if it shows another sport's vocabulary *and* none of
 * football's — so "Arsenal's owners also bought an NBA team" still passes,
 * while a Solheim Cup report doesn't.
 */
export function isFootball(...parts) {
  const text = parts.filter(Boolean).join(' ').slice(0, 4000);

  const football = FOOTBALL_TERMS.test(text) || CLUBS.test(text);
  if (football) return true;

  return !OTHER_SPORTS.test(text);
}
