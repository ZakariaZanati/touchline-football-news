import { useCallback, useEffect, useMemo, useState } from 'react';

import Header from './components/Header.jsx';
import FilterBar from './components/FilterBar.jsx';
import StoryCard from './components/StoryCard.jsx';
import { SkeletonList, EmptyState, ErrorState } from './components/States.jsx';
import { useNews } from './hooks/useNews.js';
import { fetchSources } from './api.js';
import { duration } from './lib/format.js';

const DEFAULT_FILTERS = { topic: 'all', source: 'all', q: '' };

function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // Private mode — the theme just won't persist.
    }
  }, [dark]);

  return [dark, useCallback(() => setDark((d) => !d), [])];
}

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sources, setSources] = useState([]);
  const [dark, toggleTheme] = useTheme();

  const { stories, meta, status, error, refreshing, refresh, reload } =
    useNews(filters);

  useEffect(() => {
    const controller = new AbortController();
    fetchSources(controller.signal)
      .then((data) => setSources(data.sources))
      .catch(() => {
        // Non-fatal: the source dropdown just stays empty.
      });
    return () => controller.abort();
  }, []);

  const updateFilters = useCallback((patch) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const hasFilters =
    filters.topic !== 'all' || filters.source !== 'all' || filters.q !== '';

  // The headline claim of the app, made concrete.
  const totalSaved = useMemo(
    () => duration(stories.reduce((sum, s) => sum + s.savedSeconds, 0)),
    [stories]
  );

  return (
    <div className="min-h-dvh">
      <Header
        meta={meta}
        dark={dark}
        onToggleTheme={toggleTheme}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <main className="mx-auto max-w-3xl px-4 py-5">
        <FilterBar
          filters={filters}
          onChange={updateFilters}
          sources={sources}
        />

        <div className="mt-5">
          {status === 'loading' && <SkeletonList />}

          {status === 'error' && (
            <ErrorState message={error} onRetry={reload} />
          )}

          {status === 'ready' && stories.length === 0 && (
            <EmptyState
              hasFilters={hasFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          )}

          {status === 'ready' && stories.length > 0 && (
            <>
              <div className="mb-3 flex items-baseline justify-between text-xs text-ink-400 dark:text-ink-500">
                <span>
                  {stories.length} {stories.length === 1 ? 'story' : 'stories'}
                </span>
                {totalSaved && <span>~{totalSaved} of reading saved</span>}
              </div>

              <div className="space-y-3">
                {stories.map((story, index) => (
                  <StoryCard key={story.id} story={story} index={index} />
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="mt-10 border-t border-ink-200 pt-5 text-xs leading-relaxed text-ink-400 dark:border-ink-800 dark:text-ink-500">
          <p>
            Summaries are generated from publisher RSS feeds and the articles
            they link to. Every card links back to the original reporting —
            the outlets did the journalism.
          </p>
          {meta?.warnings?.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none hover:text-ink-600 dark:hover:text-ink-300">
                {meta.warnings.length} pipeline notice
                {meta.warnings.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1.5 space-y-0.5 font-mono">
                {meta.warnings.map((warning) => (
                  <li key={warning}>· {warning}</li>
                ))}
              </ul>
            </details>
          )}
        </footer>
      </main>
    </div>
  );
}
