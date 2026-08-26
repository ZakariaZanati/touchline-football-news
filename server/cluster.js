import { signatureTokens, properNouns, jaccard } from './text.js';

/**
 * Cross-source clustering.
 *
 * Ten outlets report the same signing on the same afternoon. Showing that as
 * ten cards is exactly the noise this app exists to remove — so we group them
 * and surface one entry that says "also reported by Sky, BBC, 90min".
 */

const TITLE_THRESHOLD = 0.42;
const NAME_THRESHOLD = 0.55;
const WINDOW_HOURS = 20;

function fingerprint(story) {
  const headlineTokens = signatureTokens(story.title);
  // A little body text sharpens the signal without letting long articles
  // dominate the comparison.
  const bodyLede = (story.body ?? '').slice(0, 400);
  return {
    tokens: headlineTokens,
    names: properNouns(`${story.title}. ${bodyLede}`),
  };
}

function isSameStory(a, b) {
  if (Math.abs(a.story.publishedAt - b.story.publishedAt) > WINDOW_HOURS * 3600_000) {
    return false;
  }

  const titleSim = jaccard(a.print.tokens, b.print.tokens);
  if (titleSim >= TITLE_THRESHOLD) return true;

  // Different phrasing, same people: "Newcastle complete Gonzalez deal" vs
  // "Gonzalez joins Newcastle in £50m move". Names carry the identity.
  const nameSim = jaccard(a.print.names, b.print.names);
  return nameSim >= NAME_THRESHOLD && titleSim >= 0.22;
}

/**
 * Greedy single-pass clustering. Stories arrive newest-first, so the first
 * member of a cluster is its most recent report.
 */
export function clusterStories(stories) {
  const entries = stories.map((story) => ({ story, print: fingerprint(story) }));
  const clusters = [];

  for (const entry of entries) {
    const match = clusters.find((cluster) =>
      cluster.members.some((member) => isSameStory(member, entry))
    );
    if (match) match.members.push(entry);
    else clusters.push({ members: [entry] });
  }

  return clusters.map(({ members }) => {
    // The story we summarise should be the one with the most to say: prefer a
    // real extracted body, then outlet trust, then length.
    const ranked = [...members].sort((a, b) => {
      const bodyRank =
        Number(b.story.bodySource === 'article') -
        Number(a.story.bodySource === 'article');
      if (bodyRank !== 0) return bodyRank;
      if (b.story.trust !== a.story.trust) return b.story.trust - a.story.trust;
      return (b.story.body?.length ?? 0) - (a.story.body?.length ?? 0);
    });

    const primary = ranked[0].story;

    // One outlet often runs several angles on the same story (a preview, a
    // team-news piece, a "what channel" listing). Those are the same source
    // saying it three times, not corroboration — so credit each outlet once.
    const seenSources = new Set();
    const coverage = [];
    for (const { story } of ranked) {
      if (seenSources.has(story.sourceId)) continue;
      seenSources.add(story.sourceId);
      coverage.push({
        sourceId: story.sourceId,
        sourceName: story.sourceName,
        url: story.url,
        title: story.title,
        publishedAt: story.publishedAt,
      });
    }

    return {
      ...primary,
      // Show the freshest timestamp across the cluster — that's when the story
      // was last moving.
      publishedAt: Math.max(...members.map((m) => m.story.publishedAt)),
      coverage,
      sourceCount: seenSources.size,
    };
  });
}
