export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading stories">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-ink-200/70 bg-white p-5 dark:border-ink-800 dark:bg-ink-900/60"
        >
          <div className="flex gap-2">
            <div className="h-4 w-16 rounded-full bg-ink-200 dark:bg-ink-800" />
            <div className="h-4 w-24 rounded-full bg-ink-100 dark:bg-ink-800/60" />
          </div>
          <div className="mt-3 h-5 w-4/5 rounded bg-ink-200 dark:bg-ink-800" />
          <div className="mt-2.5 space-y-2">
            <div className="h-3.5 w-full rounded bg-ink-100 dark:bg-ink-800/60" />
            <div className="h-3.5 w-11/12 rounded bg-ink-100 dark:bg-ink-800/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onReset: () => void;
  hasFilters: boolean;
}

export function EmptyState({ onReset, hasFilters }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 py-14 text-center dark:border-ink-800">
      <p className="text-sm font-medium text-ink-700 dark:text-ink-300">
        Nothing matches that.
      </p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500 dark:text-ink-400">
        {hasFilters
          ? 'Try a broader search, or clear the filters.'
          : 'No stories in the window yet — the next refresh should bring some in.'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-800 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-white"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string | null;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-300 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/30"
    >
      <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
        Couldn’t load the feed.
      </p>
      <p className="mt-1 font-mono text-xs text-rose-700 dark:text-rose-300">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
      >
        Try again
      </button>
    </div>
  );
}
