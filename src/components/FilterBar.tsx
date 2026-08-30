import { useEffect, useState } from 'react';

import type { SourceInfo } from '../../shared/types.ts';
import type { Filters, TopicFilter } from '../types.ts';

const ALL_TOPICS: { id: TopicFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'transfer', label: 'Transfers' },
  { id: 'match', label: 'Match' },
  { id: 'injury', label: 'Injuries' },
  { id: 'manager', label: 'Managers' },
  { id: 'offfield', label: 'Off the pitch' },
  { id: 'club', label: 'Club' },
];

interface FilterBarProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  sources: SourceInfo[];
}

export default function FilterBar({
  filters,
  onChange,
  sources,
}: FilterBarProps) {
  // Local mirror so typing stays responsive; the debounce below is what
  // actually reaches the API.
  const [draft, setDraft] = useState(filters.q);

  useEffect(() => setDraft(filters.q), [filters.q]);

  useEffect(() => {
    if (draft === filters.q) return;
    const timer = setTimeout(() => onChange({ q: draft }), 260);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Filter by topic"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ALL_TOPICS.map((topic) => {
          const active = filters.topic === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ topic: topic.id })}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800/70 dark:text-ink-300 dark:hover:bg-ink-800'
              }`}
            >
              {topic.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          >
            <circle
              cx="7"
              cy="7"
              r="4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="m10.5 10.5 3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search club, player, competition…"
            aria-label="Search stories"
            className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pitch-500 focus:outline-none dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-500"
          />
        </div>

        <select
          value={filters.source}
          onChange={(event) => onChange({ source: event.target.value })}
          aria-label="Filter by source"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 focus:border-pitch-500 focus:outline-none dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >
          <option value="all">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
