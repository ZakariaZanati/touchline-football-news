/**
 * `catch` binds `unknown`, which is correct — anything can be thrown — but
 * every handler in this codebase wants the same thing from it: a string to put
 * in a warning. This is that, in one place.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** True for a fetch aborted by `AbortSignal.timeout`. */
export function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}
