/**
 * Shared text utilities: tokenising, sentence splitting, headline de-baiting
 * and hard-fact extraction. Used by both the extractive summariser and the
 * cross-source clustering.
 */

const STOPWORDS = new Set(
  `a an and are as at be been but by for from had has have he her his how i if in
   into is it its of on or our out over said she that the their them then there
   these they this to was we were what when where which who will with would you
   your after before more most other some such than too very can just also new
   now get got make made take taken back off up down about against between during
   under while both each few own same so only`
    .split(/\s+/)
    .filter(Boolean)
);

/** Football filler that carries no information about *which* story this is. */
const WEAK_TOKENS = new Set(
  `football soccer club side team match game news report reports latest update
   updates star player boss manager transfer window season fans supporters
   premier league`
    .split(/\s+/)
    .filter(Boolean)
);

export function normaliseWhitespace(str: string = ''): string {
  return String(str).replace(/\s+/g, ' ').trim();
}

/**
 * Strips accents: "Martínez" → "Martinez", "Álvarez" → "Alvarez".
 *
 * Outlets are inconsistent about diacritics on the same player within the same
 * hour, so without this the clustering treats ESPN's "Martínez" and Sky's
 * "Martinez" as two unrelated people and never groups their coverage.
 */
export function foldAccents(str: string = ''): string {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function stripHtml(html: string = ''): string {
  return normaliseWhitespace(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;|&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  );
}

/** Lowercase word tokens with stopwords removed. Keeps digits (scores, fees). */
export function tokenise(str: string = ''): string[] {
  return foldAccents(normaliseWhitespace(str))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Tokens that actually identify a story — drops generic football vocabulary so
 * "Arsenal sign Silva" and "Arsenal beat Chelsea" don't look similar just
 * because they share the word "football".
 */
export function signatureTokens(str: string = ''): Set<string> {
  return new Set(tokenise(str).filter((t) => !WEAK_TOKENS.has(t)));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Capitalised multi-word runs — a cheap proxy for names of people and clubs. */
export function properNouns(str: string = ''): Set<string> {
  const out = new Set<string>();
  // Fold first so "Martínez" and "Martinez" produce the same entry.
  const text = foldAccents(str);
  const re = /\b([A-Z][a-z''-]{2,}(?:\s+[A-Z][a-z''-]{2,})*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1];
    // Skip a sentence-initial single word — usually not a name.
    if (m.index === 0 && !phrase.includes(' ')) continue;
    out.add(phrase.toLowerCase());
  }
  return out;
}

const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|vs|No|Nos|Fig|approx|c)\.$/i;

/** Sentence splitter that doesn't break on "St." / "No. 6" / "1.5m". */
export function splitSentences(text: string = ''): string[] {
  const clean = normaliseWhitespace(text);
  if (!clean) return [];

  const parts: string[] = [];
  let buffer = '';

  for (const chunk of clean.split(/(?<=[.!?])\s+/)) {
    buffer = buffer ? `${buffer} ${chunk}` : chunk;
    const endsMidNumber = /\d\.$/.test(buffer);
    if (ABBREVIATIONS.test(buffer) || endsMidNumber) continue;
    parts.push(buffer);
    buffer = '';
  }
  if (buffer) parts.push(buffer);

  return parts.map((s) => s.trim()).filter((s) => s.length > 1);
}

// --- Headline de-baiting ---------------------------------------------------

const BAIT_PREFIXES =
  /^(?:exclusive|revealed|opinion|analysis|watch|video|live|breaking|gossip|explained|comment|column|paper talk|transfer news|report|sources?|update)\s*[:–-]\s*/i;

const BAIT_TAILS = [
  /\s*[-–—]\s*(?:and|but)\s+(?:here'?s\s+)?(?:why|how|what)\b.*$/i,
  /\s*(?:and|but)\s+(?:it|things|this)\s+(?:could|might|may|will)\s+.*$/i,
  /\s*[-–—]\s*here'?s\s+(?:why|how|what|when)\b.*$/i,
  /\s*\.\.\.\s*(?:and|but)?.*$/,
];

const BAIT_PHRASES =
  /\b(?:here'?s\s+why|here'?s\s+what|this\s+is\s+why|you\s+won'?t\s+believe|what\s+happened\s+next|the\s+real\s+reason)\b/i;

/**
 * Rewrites a publisher headline into something that states the news.
 *
 * The dominant pattern is the pull-quote headline — `'He's the one we wanted':
 * Newcastle sign Gonzalez` — where the informative half sits after the colon
 * and the quote exists purely to make you click. We keep the informative half.
 */
export interface DeBaitedHeadline {
  headline: string;
  /** True when we changed the publisher's wording, not just trimmed it. */
  rewritten: boolean;
}

export function deBaitHeadline(
  rawTitle: string = '',
  firstSentence: string = ''
): DeBaitedHeadline {
  let title = normaliseWhitespace(rawTitle);
  let rewritten = false;

  if (!title) {
    return {
      headline: normaliseWhitespace(firstSentence).slice(0, 140),
      rewritten: true,
    };
  }

  // Leading pull-quote: "'...quote...': the actual news"
  const quoted = title.match(
    /^\s*['"“‘][^'"”’]{4,}['"”’]\s*[:–-]\s*(.{12,})$/
  );
  if (quoted) {
    title = quoted[1].trim();
    rewritten = true;
  }

  // Trailing pull-quote: "the actual news: '...quote...'"
  const trailingQuote = title.match(
    /^(.{16,}?)\s*[:–-]\s*['"“‘][^'"”’]{4,}['"”’]\s*$/
  );
  if (trailingQuote) {
    title = trailingQuote[1].trim();
    rewritten = true;
  }

  if (BAIT_PREFIXES.test(title)) {
    title = title.replace(BAIT_PREFIXES, '').trim();
    rewritten = true;
  }

  for (const tail of BAIT_TAILS) {
    if (tail.test(title)) {
      title = title.replace(tail, '').trim();
      rewritten = true;
    }
  }

  // A headline that is *only* a tease has no salvageable half — take the
  // article's own opening clause instead.
  if (BAIT_PHRASES.test(title) || title.length < 16) {
    const lede = normaliseWhitespace(firstSentence);
    if (lede.length > 24) {
      const clause = lede.split(/,\s+(?=(?:who|which|after|as|with|and)\b)/)[0];
      title = clause.replace(/[.,;:]\s*$/, '');
      rewritten = true;
    }
  }

  title = title.replace(/\s*\|\s*[^|]{2,30}$/, '').trim(); // " | Football News"
  title = title.replace(/^[\s–-]+|[\s–-]+$/g, '');

  if (title.length > 150) title = `${title.slice(0, 147).trimEnd()}…`;

  return { headline: title || normaliseWhitespace(rawTitle), rewritten };
}

// --- Hard-fact extraction --------------------------------------------------

export type FactKind =
  | 'money'
  | 'score'
  | 'contract'
  | 'age'
  | 'tally'
  | 'duration';

/** A hard number pulled out of an article, with enough context to read it. */
export interface Fact {
  kind: FactKind;
  value: string;
  context: string;
  /** Character offset in the source text; used to prefer facts from the lede. */
  at: number;
}

interface FactPattern {
  kind: FactKind;
  re: RegExp;
  /** Normalises publisher-specific spellings of the same value. */
  tidy?: (value: string) => string;
}

const FACT_PATTERNS: FactPattern[] = [
  // Fees and wages: £50m, €12.5 million, $30m, £250,000-a-week
  {
    kind: 'money',
    re: /(?:[£€$]\s?\d[\d.,]*\s?(?:m|bn|k|million|billion|thousand)?(?:-a-(?:week|year))?)/gi,
    // Publishers write "£60 m", "£50M" and "£60m" interchangeably. Collapse
    // the abbreviated suffixes but leave spelled-out words ("£3 billion").
    tidy: (v: string) =>
      v
        .replace(/([£€$])\s+/, '$1')
        .replace(/(\d)\s+(m|bn|k)\b/i, '$1$2')
        .replace(/(\d)M\b/, '$1m')
        .replace(/(\d)BN\b/, '$1bn')
        .replace(/(\d)K\b/, '$1k'),
  },
  // Scorelines: 3-1, 2-2
  { kind: 'score', re: /\b\d{1,2}\s?[-–]\s?\d{1,2}\b/g },
  // Contract length: five-year deal, 3-year contract
  {
    kind: 'contract',
    re: /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)[-\s](?:year|month|week)\s+(?:deal|contract|extension|loan)\b/gi,
  },
  // Age: 24-year-old
  { kind: 'age', re: /\b\d{2}-year-old\b/gi },
  // Counts: 14 goals, 21 appearances, 3 assists.
  // The lookbehind stops the tail of a scoreline being read as a tally —
  // without it "a 4-0 defeat" yields the fact "0 defeat".
  {
    kind: 'tally',
    re: /(?<![-–\d])\b\d{1,3}\s+(?:goals?|assists?|appearances?|caps?|clean sheets?|points?|wins?|defeats?|draws?)\b/gi,
  },
  // Duration out injured: out for six weeks
  {
    kind: 'duration',
    re: /(?<![-–\d])\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:days?|weeks?|months?)\b/gi,
  },
];

/**
 * Pulls the concrete numbers out of an article — the bits a reader actually
 * wants and that clickbait headlines deliberately withhold.
 */
export function extractFacts(text: string = '', limit: number = 4): Fact[] {
  const seen = new Set<string>();
  const facts: Fact[] = [];

  for (const { kind, re, tidy } of FACT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = tidy
        ? tidy(normaliseWhitespace(m[0]))
        : normaliseWhitespace(m[0]);
      const key = `${kind}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Keep a little surrounding context so "14 goals" says goals in what.
      const start = Math.max(0, m.index - 48);
      const context = normaliseWhitespace(
        text.slice(start, Math.min(text.length, m.index + value.length + 48))
      );
      facts.push({ kind, value, context, at: m.index });
      if (facts.length >= limit * 4) break;
    }
  }

  // Money and scorelines are the highest-signal facts; ages the lowest. Within
  // a kind, prefer whatever appears earliest — a roundup article mentions many
  // fees, and the one this story is about is the one in the lede.
  const rank: Record<FactKind, number> = {
    money: 0,
    score: 1,
    contract: 2,
    tally: 3,
    duration: 4,
    age: 5,
  };
  facts.sort((a, b) => rank[a.kind] - rank[b.kind] || a.at - b.at);

  return facts.slice(0, limit);
}

/** Rough read time in seconds, at ~240 wpm. */
export function readSeconds(text: string = ''): number {
  const words = normaliseWhitespace(text).split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round((words / 240) * 60));
}
