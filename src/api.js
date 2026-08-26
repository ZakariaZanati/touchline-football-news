const BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // Non-JSON error body — the status is all we have.
    }
    throw new Error(detail);
  }

  return response.json();
}

export function fetchNews({ topic = 'all', source = 'all', q = '' } = {}, signal) {
  const params = new URLSearchParams();
  if (topic !== 'all') params.set('topic', topic);
  if (source !== 'all') params.set('source', source);
  if (q.trim()) params.set('q', q.trim());

  const query = params.toString();
  return request(`/news${query ? `?${query}` : ''}`, { signal });
}

export function fetchSources(signal) {
  return request('/sources', { signal });
}

export function triggerRefresh() {
  return request('/refresh', { method: 'POST' });
}
