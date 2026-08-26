/**
 * Topic and competition tagging.
 *
 * Deliberately keyword-driven rather than clever: the categories are coarse,
 * the vocabulary is stable, and a wrong tag is cheap. Used by the extractive
 * engine, and as a fallback when Claude omits a field.
 */

export const TOPICS = [
  { id: 'transfer', label: 'Transfers' },
  { id: 'match', label: 'Match' },
  { id: 'injury', label: 'Injuries' },
  { id: 'manager', label: 'Managers' },
  { id: 'offfield', label: 'Off the pitch' },
  { id: 'club', label: 'Club news' },
  { id: 'other', label: 'Other' },
];

const TOPIC_RULES = [
  // Highest weight: a player's career history mentions transfers and goals in
  // passing, so without this a court case reads as a transfer story.
  {
    id: 'offfield',
    weight: 6,
    re: /\b(?:charged|charges|court|arrested|police|prosecut\w+|trial|verdict|convicted|sentenced|banned|suspension|misconduct|investigat\w+|allegation\w*|racial abuse|racism|doping|betting charges|gambling charges|tribunal|lawsuit|fined £)\b/gi,
  },
  {
    id: 'transfer',
    weight: 3,
    re: /\b(?:transfer|signing|signs?|signed|joins?|joined|bid|fee|deal|loan|contract|medical|release clause|move to|deadline day|swoop|target)\b/gi,
  },
  {
    id: 'injury',
    weight: 3,
    re: /\b(?:injur\w+|hamstring|acl|knee|ankle|calf|groin|sidelined|out for|ruled out|surgery|scan|fitness|comeback|return from)\b/gi,
  },
  {
    id: 'manager',
    weight: 3,
    re: /\b(?:manager|head coach|sacked|sack|dismissed|appointed|takes charge|interim|successor|hot seat|resign\w*|steps down)\b/gi,
  },
  {
    id: 'match',
    weight: 2,
    re: /\b(?:beat|defeat\w*|win|won|draw|drew|lost|loss|goal\w*|scored|scoreline|full-time|half-time|kick-off|penalt\w+|red card|yellow card|equalis\w+|hat-trick|clean sheet)\b/gi,
  },
  {
    id: 'club',
    weight: 1,
    re: /\b(?:takeover|owner\w*|stadium|academy|sponsor\w*|financial|ffp|psr|points deduction|board|shareholder|kit)\b/gi,
  },
];

// Order matters — the first match wins, so the more specific entries come
// first (a Women's Champions League tie should read as women's football).
const COMPETITIONS = [
  // A bare "women's" matches any women's sport — anchor it to football.
  { id: 'wsl', label: "Women's football", re: /\b(?:wsl\b|women'?s super league|women'?s (?:football|world cup|euros?|champions league))\b/i },
  { id: 'premier-league', label: 'Premier League', re: /\bpremier league\b|\bepl\b/i },
  { id: 'champions-league', label: 'Champions League', re: /\bchampions league\b|\bucl\b/i },
  { id: 'europa-league', label: 'Europa League', re: /\beuropa league\b/i },
  { id: 'conference-league', label: 'Conference League', re: /\bconference league\b/i },
  { id: 'fa-cup', label: 'FA Cup', re: /\bfa cup\b/i },
  { id: 'efl-cup', label: 'EFL Cup', re: /\b(?:carabao cup|league cup|efl cup)\b/i },
  // Bare "championship" matches golf and darts events, so require the
  // football-specific forms.
  { id: 'championship', label: 'Championship', re: /\b(?:sky bet championship|efl championship|the championship)\b|\befl\b/i },
  { id: 'la-liga', label: 'La Liga', re: /\bla liga\b/i },
  { id: 'serie-a', label: 'Serie A', re: /\bserie a\b/i },
  { id: 'bundesliga', label: 'Bundesliga', re: /\bbundesliga\b/i },
  { id: 'ligue-1', label: 'Ligue 1', re: /\bligue 1\b/i },
  { id: 'international', label: 'International', re: /\b(?:world cup|euro 20\d\d|nations league|qualifier|friendly international)\b/i },
];

export function classifyTopic(text = '') {
  const scores = new Map();

  for (const { id, re, weight } of TOPIC_RULES) {
    re.lastIndex = 0;
    const hits = (text.match(re) ?? []).length;
    if (hits) scores.set(id, hits * weight);
  }

  if (!scores.size) return 'other';
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function classifyCompetition(text = '') {
  const found = COMPETITIONS.find(({ re }) => re.test(text));
  return found ? found.label : null;
}

export function normaliseTopic(value) {
  const id = String(value ?? '').toLowerCase().trim();
  return TOPICS.some((t) => t.id === id) ? id : 'other';
}
