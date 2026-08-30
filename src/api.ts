import type {
  NewsResponse,
  RefreshResponse,
  SourcesResponse,
} from '../shared/types.ts';
import type { Filters } from './types.ts';

const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, options);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      // Non-JSON error body — the status is all we have.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export function fetchNews(
  { topic = 'all', source = 'all', q = '' }: Partial<Filters> = {},
  signal?: AbortSignal
): Promise<NewsResponse> {
  const params = new URLSearchParams();
  if (topic !== 'all') params.set('topic', topic);
  if (source !== 'all') params.set('source', source);
  if (q.trim()) params.set('q', q.trim());

  const query = params.toString();
  return request<NewsResponse>(`/news${query ? `?${query}` : ''}`, { signal });
}

export function fetchSources(signal?: AbortSignal): Promise<SourcesResponse> {
  return request<SourcesResponse>('/sources', { signal });
}

export function triggerRefresh(): Promise<RefreshResponse> {
  return request<RefreshResponse>('/refresh', { method: 'POST' });
}
