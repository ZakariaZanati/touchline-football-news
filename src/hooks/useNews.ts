import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchNews, triggerRefresh } from '../api.ts';
import type { Meta, Story } from '../../shared/types.ts';
import type { Filters } from '../types.ts';

type Status = 'loading' | 'ready' | 'error';

export interface NewsState {
  stories: Story[];
  meta: Meta | null;
  status: Status;
  error: string | null;
  refreshing: boolean;
  /** Forces a server-side refresh, then reloads. */
  refresh: () => Promise<void>;
  /** Re-runs the current query without refreshing the server's snapshot. */
  reload: () => Promise<void>;
}

/**
 * Loads the story feed for the active filters.
 *
 * Filtering happens server-side so the client never holds the full corpus, and
 * every request is abortable — typing in the search box fires a request per
 * keystroke-batch and only the last one should win.
 */
export function useNews(filters: Filters): NewsState {
  const [stories, setStories] = useState<Story[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only blank the screen on the very first load. Re-filtering should leave
    // the current results visible rather than flashing a skeleton.
    if (!loadedOnce.current) setStatus('loading');

    try {
      const data = await fetchNews(filters, controller.signal);
      setStories(data.stories);
      setMeta(data.meta);
      setError(null);
      setStatus('ready');
      loadedOnce.current = true;
    } catch (err) {
      // Superseded by a newer request — not a failure worth showing.
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [
    filters.topic,
    filters.source,
    filters.country,
    filters.club,
    filters.q,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerRefresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { stories, meta, status, error, refreshing, refresh, reload: load };
}
