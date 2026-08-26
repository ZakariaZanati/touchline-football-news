import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchNews, triggerRefresh } from '../api.js';

/**
 * Loads the story feed for the active filters.
 *
 * Filtering happens server-side so the client never holds the full corpus, and
 * every request is abortable — typing in the search box fires a request per
 * keystroke-batch and only the last one should win.
 */
export function useNews(filters) {
  const [stories, setStories] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const abortRef = useRef(null);
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
      if (err.name === 'AbortError') return; // superseded by a newer request
      setError(err.message);
      setStatus('error');
    }
  }, [filters.topic, filters.source, filters.q]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { stories, meta, status, error, refreshing, refresh, reload: load };
}
