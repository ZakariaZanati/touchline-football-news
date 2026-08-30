/**
 * Football relevance gate.
 *
 * Even feeds published under a "football" URL leak — outlets syndicate a darts
 * final or an F1 grid penalty into the same channel. One tennis card in a
 * football feed is the kind of noise this app is supposed to be free of, so we
 * check every story rather than trusting the feed's label.
 */

import { CLUB_PATTERN } from './clubs.ts';
import { foldAccents } from './text.ts';

const FOOTBALL_TERMS =
  /\b(?:football|footballer|premier league|champions league|europa league|conference league|la ?liga|serie a|bundesliga|ligue 1|eredivisie|fa cup|carabao cup|league cup|efl|uefa|fifa|world cup|nations league|transfer window|striker|midfielder|defender|goalkeeper|winger|centre-back|full-back|penalty box|offside|var\b|matchday|kick-?off|clean sheet|hat-?trick|substitute|caps?\b|loan (?:deal|move|spell)|manager|head coach|squad|dressing room|touchline|free-?kick|corner kick|extra time|group stage|relegation|promotion|derby)\b/i;

// Spanish football vocabulary. Kept separate from the English list only for
// readability — both are checked against every story.
const FOOTBALL_TERMS_ES =
  /\b(?:futbol|futbolista|la ?liga|primera division|segunda division|copa del rey|supercopa|liga de campeones|champions|europa league|mundial|eurocopa|seleccion|delantero|centrocampista|defensa|portero|extremo|lateral|mediapunta|fuera de juego|jornada|penalti|penalty|tarjeta roja|tarjeta amarilla|hat-?trick|porteria a cero|cesion|fichaje|traspaso|clausula|mercado de fichajes|entrenador|tecnico|banquillo|vestuario|prorroga|fase de grupos|descenso|ascenso|derbi|clasico)\b/i;

// Other sports, in both languages — the gate exists because outlets syndicate
// darts and F1 into a football-labelled feed.
const OTHER_SPORTS =
  /\b(?:darts|dardos|snooker|formula ?1|f1\b|grand prix|gran premio|motogp|motociclismo|golf|pga|liv golf|ryder cup|solheim cup|tennis|tenis|wimbledon|atp\b|wta\b|boxing|boxeo|heavyweight|ufc|mma\b|cricket|test match|the ashes|ipl\b|rugby|six nations|nfl\b|nba\b|baloncesto|mlb\b|nhl\b|cycling|ciclismo|tour de france|vuelta a espana|athletics|atletismo|olympic|olimpic\w*|swimming|natacion|balonmano|waterpolo|horse racing|hipica|cheltenham|grand national|netball|hockey)\b/i;

/**
 * Returns true when the text is about football.
 *
 * A story only fails if it shows another sport's vocabulary *and* none of
 * football's — so "Arsenal's owners also bought an NBA team" still passes,
 * while a Solheim Cup report doesn't.
 */
export function isFootball(
  ...parts: (string | null | undefined)[]
): boolean {
  const raw = parts.filter(Boolean).join(' ').slice(0, 4000);
  // Fold so "Atlético" and "fútbol" match the accent-free patterns above.
  const text = foldAccents(raw);

  const football =
    FOOTBALL_TERMS.test(text) ||
    FOOTBALL_TERMS_ES.test(text) ||
    CLUB_PATTERN.test(text);
  if (football) return true;

  return !OTHER_SPORTS.test(text);
}
