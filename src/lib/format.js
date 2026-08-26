/** Compact relative time: "just now", "12m ago", "3h ago", "Tue". */
export function timeAgo(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';

  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 90) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(then).toLocaleDateString(undefined, { weekday: 'short' });
}

/** "1m 40s" / "45s" — used for the reading time we saved you. */
export function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 1) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const TOPIC_STYLES = {
  transfer: 'bg-pitch-500/12 text-pitch-700 dark:text-pitch-300 ring-pitch-500/25',
  match: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
  injury: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25',
  manager: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
  offfield: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25',
  club: 'bg-teal-500/12 text-teal-700 dark:text-teal-300 ring-teal-500/25',
  other: 'bg-ink-500/12 text-ink-600 dark:text-ink-300 ring-ink-500/25',
};

export const TOPIC_LABELS = {
  transfer: 'Transfer',
  match: 'Match',
  injury: 'Injury',
  manager: 'Manager',
  offfield: 'Off the pitch',
  club: 'Club',
  other: 'News',
};
