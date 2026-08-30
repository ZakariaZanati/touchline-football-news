import { useState } from 'react';
import type { ReactNode } from 'react';

import type { Language, Story } from '../../shared/types.ts';

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  es: 'Español',
};
import {
  timeAgo,
  duration,
  hostOf,
  TOPIC_STYLES,
  TOPIC_LABELS,
} from '../lib/format.ts';

interface ChipProps {
  children: ReactNode;
  className?: string;
  /** Native tooltip, for chips whose meaning isn't obvious from the label. */
  title?: string;
}

function Chip({ children, className = '', title }: ChipProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * One story.
 *
 * Deliberate omissions: no thumbnail, no "read more" call to action, no
 * engagement bait. The summary is the product — the link to the original is
 * there for anyone who wants the long version, not as the point of the card.
 */
interface StoryCardProps {
  story: Story;
  /** Position in the list, used to stagger the entry animation. */
  index: number;
}

export default function StoryCard({ story, index }: StoryCardProps) {
  const [showSources, setShowSources] = useState(false);

  const saved = duration(story.savedSeconds);
  const topicClass = TOPIC_STYLES[story.topic] ?? TOPIC_STYLES.other;

  return (
    <article
      className="story-enter group relative rounded-xl border border-ink-200/70 bg-white p-4 transition-colors hover:border-ink-300 sm:p-5 dark:border-ink-800 dark:bg-ink-900/60 dark:hover:border-ink-700"
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Chip className={topicClass}>
          {TOPIC_LABELS[story.topic] ?? 'News'}
        </Chip>

        {story.competition && (
          <Chip className="bg-ink-500/10 text-ink-600 ring-ink-500/20 dark:text-ink-300">
            {story.competition}
          </Chip>
        )}

        {/* Only shown when we failed to bring it into English — a translated
            story is just a story, and does not need announcing. */}
        {story.language !== 'en' && (
          <Chip
            className="bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300"
            title={`Summarised in ${LANGUAGE_LABELS[story.language] ?? story.language} — set an API key to get English summaries`}
          >
            {LANGUAGE_LABELS[story.language] ?? story.language}
          </Chip>
        )}

        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400 dark:text-ink-500">
          {timeAgo(story.publishedAt)}
        </span>
      </div>

      <h2 className="text-balance text-[17px] font-semibold leading-snug tracking-[-0.011em] text-ink-900 sm:text-lg dark:text-ink-50">
        {story.headline}
      </h2>

      <p className="mt-2 text-[15px] leading-relaxed text-ink-700 dark:text-ink-300">
        {story.bottomLine}
      </p>

      {story.keyFacts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {story.keyFacts.map((fact) => (
            <li key={fact}>
              <span className="inline-flex rounded-md bg-ink-100 px-2 py-1 text-xs font-medium tabular-nums text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                {fact}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-100 pt-3 text-xs dark:border-ink-800">
        {story.sourceCount > 1 ? (
          <button
            type="button"
            onClick={() => setShowSources((open) => !open)}
            aria-expanded={showSources}
            className="inline-flex items-center gap-1 rounded font-medium text-ink-600 transition-colors hover:text-pitch-600 dark:text-ink-400 dark:hover:text-pitch-400"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pitch-500/60" />
            </span>
            {story.sourceCount} sources
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              className={`h-3 w-3 transition-transform ${showSources ? 'rotate-180' : ''}`}
            >
              <path
                d="M3 4.5 6 7.5 9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span className="font-medium text-ink-500 dark:text-ink-400">
            {story.sourceName}
          </span>
        )}

        {saved && (
          <span
            className="text-ink-400 dark:text-ink-500"
            title="Reading time saved versus the full article"
          >
            saved you ~{saved}
          </span>
        )}

        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-ink-500 underline-offset-2 transition-colors hover:text-ink-900 hover:underline dark:text-ink-400 dark:hover:text-ink-100"
        >
          full article
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3">
            <path
              d="M4 2h6v6M10 2 3 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>

      {showSources && (
        <ul className="mt-2.5 space-y-1.5 rounded-lg bg-ink-50 p-2.5 dark:bg-ink-950/60">
          {story.coverage.map((item) => (
            <li key={item.url} className="text-xs leading-snug">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link flex gap-2"
              >
                <span className="shrink-0 font-medium text-ink-700 dark:text-ink-300">
                  {item.sourceName}
                </span>
                <span className="truncate text-ink-500 group-hover/link:underline dark:text-ink-400">
                  {item.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {story.headlineRewritten && (
        <details className="mt-2 text-[11px] text-ink-400 dark:text-ink-500">
          <summary className="cursor-pointer list-none select-none hover:text-ink-600 dark:hover:text-ink-300">
            original headline
          </summary>
          <p className="mt-1 italic">
            “{story.originalHeadline}” — {hostOf(story.url)}
          </p>
        </details>
      )}
    </article>
  );
}
