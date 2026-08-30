import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import express from 'express';
import cors from 'cors';

import { config, summarizerEngine, translatorEngine } from './config.ts';
import { errorMessage } from './errors.ts';
import { CLUBS, COUNTRIES } from './clubs.ts';
import { SOURCES } from './sources.ts';
import { foldAccents } from './text.ts';
import { TOPICS } from './summarize/index.ts';
import {
  getStories,
  getMeta,
  refresh,
  startBackgroundRefresh,
} from './pipeline.ts';
import type {
  NewsResponse,
  RefreshResponse,
  SourcesResponse,
  Story,
} from '../shared/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '128kb' }));

/** Reads a query-string value that may arrive repeated or absent. */
const queryParam = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Both sides are accent-folded, so typing "atletico" finds "Atlético Madrid"
 * and "espanol" finds "Español". Nobody reaches for a dead key to use a search
 * box, and half the corpus is Spanish.
 */
const matchesQuery = (story: Story, query: string): boolean => {
  const haystack = foldAccents(
    [
      story.headline,
      story.bottomLine,
      story.originalHeadline,
      story.competition ?? '',
      ...story.clubs.map((c) => c.name),
      ...story.keyFacts,
      ...story.coverage.map((c) => c.sourceName),
    ].join(' ')
  ).toLowerCase();

  return foldAccents(query)
    .split(/\s+/)
    .every((term) => haystack.includes(term));
};

app.get('/api/news', async (req, res) => {
  try {
    const all = await getStories();

    const topic = queryParam(req.query.topic, 'all').toLowerCase();
    const source = queryParam(req.query.source, 'all').toLowerCase();
    const country = queryParam(req.query.country, 'all').toLowerCase();
    const club = queryParam(req.query.club, 'all').toLowerCase();
    const query = queryParam(req.query.q).trim().toLowerCase();
    const limit = Math.min(
      Number.parseInt(queryParam(req.query.limit), 10) || 100,
      200
    );

    let stories = all;
    if (topic !== 'all') stories = stories.filter((s) => s.topic === topic);
    if (source !== 'all') {
      stories = stories.filter((s) =>
        s.coverage.some((c) => c.sourceId === source)
      );
    }
    // Country and club describe the football, not the outlet: a Guardian piece
    // about Real Madrid is a Spain story.
    const countryId = COUNTRIES.find((c) => c.id === country)?.id;
    if (countryId) {
      stories = stories.filter((s) => s.countries.includes(countryId));
    }
    if (club !== 'all') {
      stories = stories.filter((s) => s.clubs.some((c) => c.id === club));
    }
    if (query) stories = stories.filter((s) => matchesQuery(s, query));

    const body: NewsResponse = {
      stories: stories.slice(0, limit),
      total: stories.length,
      meta: getMeta(),
    };
    res.json(body);
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.get('/api/meta', (_req, res) => res.json(getMeta()));

app.get('/api/sources', (_req, res) => {
  const body: SourcesResponse = {
    sources: SOURCES.map(({ id, name, url, country, language }) => ({
      id,
      name,
      url,
      country,
      language,
    })),
    topics: TOPICS,
    countries: COUNTRIES,
    clubs: CLUBS.map(({ id, name, country }) => ({ id, name, country })),
  };
  res.json(body);
});

app.post('/api/refresh', async (_req, res) => {
  try {
    await refresh({ force: true });
    const body: RefreshResponse = { ok: true, meta: getMeta() };
    res.json(body);
  } catch (error) {
    const body: RefreshResponse = { ok: false, error: errorMessage(error) };
    res.status(500).json(body);
  }
});

app.get('/api/health', (_req, res) => {
  const meta = getMeta();
  res.status(meta.lastError && !meta.storyCount ? 503 : 200).json({
    ok: !meta.lastError || meta.storyCount > 0,
    ...meta,
  });
});

// In production the built SPA is served from the same origin as the API.
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) =>
    res.sendFile(path.join(distDir, 'index.html'))
  );
}

app.listen(config.port, () => {
  const engine = summarizerEngine();
  const translator = translatorEngine();
  console.log(`  football-news api   http://localhost:${config.port}`);
  console.log(`  summariser          ${config.summarizer} (resolves to ${engine})`);
  console.log(`  translator          ${config.translator} (resolves to ${translator})`);
  console.log(`  refresh every       ${config.refreshMinutes}m`);

  const foreign = SOURCES.filter((s) => s.language !== 'en');
  if (translator === 'none' && foreign.length) {
    console.log('');
    console.log(
      `  note: ${foreign.length} non-English sources (${foreign
        .map((s) => s.name)
        .join(', ')}) will be summarised in their own language.`
    );
    console.log('        Set ANTHROPIC_API_KEY to get English summaries.');
  }

  startBackgroundRefresh();
});
