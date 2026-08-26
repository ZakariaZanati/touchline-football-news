import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { SOURCES } from './sources.js';
import { TOPICS } from './summarize/index.js';
import {
  getStories,
  getMeta,
  refresh,
  startBackgroundRefresh,
} from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '128kb' }));

const matchesQuery = (story, query) => {
  const haystack = [
    story.headline,
    story.bottomLine,
    story.originalHeadline,
    story.competition ?? '',
    ...story.clubs,
    ...story.keyFacts,
    ...story.coverage.map((c) => c.sourceName),
  ]
    .join(' ')
    .toLowerCase();
  return query.split(/\s+/).every((term) => haystack.includes(term));
};

app.get('/api/news', async (req, res) => {
  try {
    const all = await getStories();

    const topic = String(req.query.topic ?? 'all').toLowerCase();
    const source = String(req.query.source ?? 'all').toLowerCase();
    const query = String(req.query.q ?? '').trim().toLowerCase();
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 200);

    let stories = all;
    if (topic !== 'all') stories = stories.filter((s) => s.topic === topic);
    if (source !== 'all') {
      stories = stories.filter((s) =>
        s.coverage.some((c) => c.sourceId === source)
      );
    }
    if (query) stories = stories.filter((s) => matchesQuery(s, query));

    res.json({
      stories: stories.slice(0, limit),
      total: stories.length,
      meta: getMeta(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meta', (_req, res) => res.json(getMeta()));

app.get('/api/sources', (_req, res) => {
  res.json({
    sources: SOURCES.map(({ id, name, url }) => ({ id, name, url })),
    topics: TOPICS,
  });
});

app.post('/api/refresh', async (_req, res) => {
  try {
    await refresh({ force: true });
    res.json({ ok: true, meta: getMeta() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
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
  const engine = config.anthropicApiKey ? 'claude' : 'extractive';
  console.log(`  football-news api   http://localhost:${config.port}`);
  console.log(`  summariser          ${config.summarizer} (resolves to ${engine})`);
  console.log(`  refresh every       ${config.refreshMinutes}m`);
  startBackgroundRefresh();
});
