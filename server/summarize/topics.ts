/**
 * Topic and competition tagging.
 *
 * Deliberately keyword-driven rather than clever: the categories are coarse,
 * the vocabulary is stable, and a wrong tag is cheap. Used by the extractive
 * engine, and as a fallback when Claude omits a field.
 */

import { foldAccents } from '../text.ts';
import type { CountryId, Topic, TopicId } from '../../shared/types.ts';

/**
 * The topic vocabulary. `TopicId` lives in the shared contract, so adding a
 * category here without teaching the client about it fails the build.
 */
export const TOPICS: Topic[] = [
  { id: 'transfer', label: 'Transfers' },
  { id: 'match', label: 'Match' },
  { id: 'injury', label: 'Injuries' },
  { id: 'manager', label: 'Managers' },
  { id: 'offfield', label: 'Off the pitch' },
  { id: 'club', label: 'Club news' },
  { id: 'other', label: 'Other' },
];

interface TopicRule {
  id: TopicId;
  /** Higher weight wins ties between categories that both match. */
  weight: number;
  re: RegExp;
}

const TOPIC_RULES: TopicRule[] = [
  // Highest weight: a player's career history mentions transfers and goals in
  // passing, so without this a court case reads as a transfer story.
  {
    id: 'offfield',
    weight: 6,
    re: /\b(?:charged|charges|court|arrested|police|prosecut\w+|trial|verdict|convicted|sentenced|banned|suspension|misconduct|investigat\w+|allegation\w*|racial abuse|racism|doping|betting charges|gambling charges|tribunal|lawsuit|fined £|denuncia\w*|juzgado|detenido|policia|juicio|condenado|sancionado|sancion|expediente|investigacion|acusacion\w*|racismo|dopaje|apuestas)\b/gi,
  },
  {
    id: 'transfer',
    weight: 3,
    re: /\b(?:transfer|signing|signs?|signed|joins?|joined|bid|fee|deal|loan|contract|medical|release clause|move to|deadline day|swoop|target|fichaje|fichar|ficha|traspaso|cesion|cedido|contrato|renovacion|renueva|clausula|acuerdo|oferta|reconocimiento medico|mercado)\b/gi,
  },
  {
    id: 'injury',
    weight: 3,
    re: /\b(?:injur\w+|hamstring|acl|knee|ankle|calf|groin|sidelined|out for|ruled out|surgery|scan|fitness|comeback|return from|lesion|lesionado|lesiona\w*|baja|bajas|rodilla|tobillo|isquiotibial|gemelo|aductor|operacion|quirofano|recuperacion|molestias|reaparicion)\b/gi,
  },
  {
    id: 'manager',
    weight: 3,
    re: /\b(?:manager|head coach|sacked|sack|dismissed|appointed|takes charge|interim|successor|hot seat|resign\w*|steps down|entrenador|tecnico|destituido|destitucion|cesado|cese|nuevo tecnico|banquillo|sustituto|dimite|dimision|interino)\b/gi,
  },
  {
    id: 'match',
    weight: 2,
    re: /\b(?:beat|defeat\w*|win|won|draw|drew|lost|loss|goal\w*|scored|scoreline|full-time|half-time|kick-off|penalt\w+|red card|yellow card|equalis\w+|hat-trick|clean sheet|gana|gano|ganar|vence|vencio|empate|empato|derrota|pierde|perdio|gol|goles|marco|remontada|goleada|penalti|tarjeta roja|tarjeta amarilla|descanso|prorroga|empatar)\b/gi,
  },
  {
    id: 'club',
    weight: 1,
    re: /\b(?:takeover|owner\w*|stadium|academy|sponsor\w*|financial|ffp|psr|points deduction|board|shareholder|kit|propietario|accionista|presidente|directiva|estadio|cantera|filial|patrocinador|patrocinio|fair play financiero|limite salarial|socios|camiseta)\b/gi,
  },
];

// Order matters — the first match wins, so the more specific entries come
// first (a Women's Champions League tie should read as women's football).
interface Competition {
  id: string;
  label: string;
  re: RegExp;
  /** The country whose football this competition is, where there is one. */
  country?: CountryId;
}

// Matched against accent-folded text, so no diacritics in these patterns.
// Order still breaks ties, so the more specific entries come first (a Women's
// Champions League tie should read as women's football).
const COMPETITIONS: Competition[] = [
  // A bare "women's" matches any women's sport — anchor it to football.
  { id: 'wsl', label: "Women's football", re: /\b(?:wsl\b|women'?s super league|women'?s (?:football|world cup|euros?|champions league)|futbol femenino|liga f\b)\b/gi },
  { id: 'premier-league', label: 'Premier League', re: /\bpremier league\b|\bepl\b/gi, country: 'england' },
  { id: 'champions-league', label: 'Champions League', re: /\bchampions league\b|\bucl\b|\bliga de campeones\b/gi },
  { id: 'europa-league', label: 'Europa League', re: /\beuropa league\b/gi },
  { id: 'conference-league', label: 'Conference League', re: /\bconference league\b/gi },
  { id: 'fa-cup', label: 'FA Cup', re: /\bfa cup\b/gi, country: 'england' },
  { id: 'efl-cup', label: 'EFL Cup', re: /\b(?:carabao cup|league cup|efl cup)\b/gi, country: 'england' },
  // Bare "championship" matches golf and darts events, so require the
  // football-specific forms.
  { id: 'championship', label: 'Championship', re: /\b(?:sky bet championship|efl championship|the championship)\b|\befl\b/gi, country: 'england' },
  // Spanish outlets write it as one word — "LaLiga EA Sports" — so the space
  // has to be optional or every Spanish match report goes untagged.
  { id: 'la-liga', label: 'La Liga', re: /\bla ?liga\b|\bprimera division\b/gi, country: 'spain' },
  { id: 'copa-del-rey', label: 'Copa del Rey', re: /\bcopa del rey\b/gi, country: 'spain' },
  { id: 'supercopa', label: 'Supercopa', re: /\bsupercopa(?: de espana)?\b/gi, country: 'spain' },
  { id: 'segunda', label: 'Segunda División', re: /\bsegunda division\b|\bhypermotion\b/gi, country: 'spain' },
  { id: 'serie-a', label: 'Serie A', re: /\bserie a\b/gi, country: 'italy' },
  { id: 'bundesliga', label: 'Bundesliga', re: /\bbundesliga\b/gi, country: 'germany' },
  { id: 'ligue-1', label: 'Ligue 1', re: /\bligue 1\b/gi, country: 'france' },
  { id: 'international', label: 'International', re: /\b(?:world cup|euro 20\d\d|nations league|qualifier|friendly international|mundial|eurocopa|clasificacion)\b/gi },
];

export function classifyTopic(text: string = ''): TopicId {
  const scores = new Map<TopicId, number>();
  // The Spanish rules are written without accents, so fold before matching.
  const haystack = foldAccents(text);

  for (const { id, re, weight } of TOPIC_RULES) {
    re.lastIndex = 0;
    const hits = (haystack.match(re) ?? []).length;
    if (hits) scores.set(id, hits * weight);
  }

  if (!scores.size) return 'other';
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * The competition a story is about.
 *
 * Scored by how often each is named rather than taking the first pattern that
 * hits anywhere in the article: a La Liga match report that mentions the
 * Champions League once in passing is still a La Liga match report, and the
 * first-match-wins version used to mislabel exactly that case.
 *
 * `prefer` is the countries the story's clubs put it in. It doubles the score
 * of a competition from one of those countries, which is what stops a
 * Barcelona-Atlético transfer story that mentions Arsenal's interest twice
 * from being filed under the Premier League.
 */
export interface CompetitionQuery {
  title: string;
  /** The article's opening only. Anything deeper is background, not subject. */
  lede?: string;
  /** Countries the story's clubs put it in. */
  prefer?: readonly CountryId[];
}

export function findCompetition({
  title,
  lede = '',
  prefer = [],
}: CompetitionQuery): Competition | null {
  const inTitle = foldAccents(title);
  const inLede = foldAccents(lede);
  let best: { competition: Competition; score: number } | null = null;

  for (const competition of COMPETITIONS) {
    competition.re.lastIndex = 0;
    const titleHits = (inTitle.match(competition.re) ?? []).length;
    competition.re.lastIndex = 0;
    const ledeHits = (inLede.match(competition.re) ?? []).length;
    if (!titleHits && !ledeHits) continue;

    const home = competition.country && prefer.includes(competition.country);
    const score = (titleHits * 3 + ledeHits) * (home ? 2 : 1);
    // Strictly greater, so registry order still breaks ties.
    if (!best || score > best.score) best = { competition, score };
  }

  return best ? best.competition : null;
}

export function classifyCompetition(query: CompetitionQuery): string | null {
  return findCompetition(query)?.label ?? null;
}

/** The country a competition implies, for stories with no club match. */
export function competitionCountry(query: CompetitionQuery): CountryId | null {
  return findCompetition(query)?.country ?? null;
}

/**
 * Narrows an untrusted string — Claude's `topic` field — to a known topic id,
 * falling back to 'other' for anything unrecognised.
 */
export function normaliseTopic(value: unknown): TopicId {
  const id = String(value ?? '')
    .toLowerCase()
    .trim();
  return TOPICS.some((t) => t.id === id) ? (id as TopicId) : 'other';
}
