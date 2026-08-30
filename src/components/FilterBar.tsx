import { useEffect, useMemo, useState } from 'react';

import type { ClubInfo, Country, SourceInfo } from '../../shared/types.ts';
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

/** Shared styling for the three registry dropdowns. */
const SELECT_CLASS =
  'min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 focus:border-pitch-500 focus:outline-none sm:flex-none dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200';

interface FilterBarProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  sources: SourceInfo[];
  countries: Country[];
  clubs: ClubInfo[];
}

export default function FilterBar({
  filters,
  onChange,
  sources,
  countries,
  clubs,
}: FilterBarProps) {
  // Local mirror so typing stays responsive; the debounce below is what
  // actually reaches the API.
  const [draft, setDraft] = useState(filters.q);

  // Picking a country narrows the club list to that country's clubs — the full
  // registry is ~70 entries, which is a long dropdown to scroll for one club.
  //
  // Sorted for the reader, not left in registry order: the registry is grouped
  // by country because that is how it is maintained, which is no help at all
  // when you are hunting for one name in a dropdown. localeCompare so that
  // "Alavés" files under A rather than after Z.
  const clubOptions = useMemo(
    () =>
      (filters.country === 'all'
        ? [...clubs]
        : clubs.filter((c) => c.country === filters.country)
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [clubs, filters.country]
  );

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

      <div className="flex flex-col gap-2">
        <div className="relative">
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

        <div className="flex gap-2">
          <select
            value={filters.country}
            onChange={(event) => {
              // A club from the old country would filter to nothing, so clear
              // it rather than leaving an impossible combination selected.
              const country = event.target.value;
              const keepsClub =
                filters.club === 'all' ||
                country === 'all' ||
                clubs.find((c) => c.id === filters.club)?.country === country;
              onChange({ country, ...(keepsClub ? {} : { club: 'all' }) });
            }}
            aria-label="Filter by country"
            className={SELECT_CLASS}
          >
            <option value="all">All countries</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.label}
              </option>
            ))}
          </select>

          <select
            value={filters.club}
            onChange={(event) => onChange({ club: event.target.value })}
            aria-label="Filter by club"
            className={SELECT_CLASS}
          >
            <option value="all">All clubs</option>
            {clubOptions.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>

          <select
            value={filters.source}
            onChange={(event) => onChange({ source: event.target.value })}
            aria-label="Filter by source"
            className={SELECT_CLASS}
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
    </div>
  );
}
