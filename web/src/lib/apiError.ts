/**
 * Normalizes Flask `error_response` / legacy shapes — mirrors
 * `frontend/src/services/api.js` interceptor order:
 * `error.message` | `error` (string) | top-level `message` | axios message | fallback.
 */
export function extractApiErrorMessage(
  err: unknown,
  responseData: unknown
): string {
  if (responseData && typeof responseData === "object") {
    const r = responseData as {
      error?: unknown;
      message?: unknown;
    };
    const nested = r.error;
    if (
      nested &&
      typeof nested === "object" &&
      nested !== null &&
      "message" in nested
    ) {
      const m = (nested as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
    if (typeof nested === "string") return nested;
    if (typeof r.message === "string") return r.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "An unexpected error occurred";
}

/**
 * Extracts the structured ``error.code`` from a Flask ``error_response`` body
 * (e.g. ``"TIINGO_NO_API_KEY"``). Returns ``null`` when the response shape
 * doesn't include a code so callers can fall back to message-only handling.
 */
export function extractApiErrorCode(responseData: unknown): string | null {
  if (responseData && typeof responseData === "object") {
    const nested = (responseData as { error?: unknown }).error;
    if (
      nested &&
      typeof nested === "object" &&
      nested !== null &&
      "code" in nested
    ) {
      const c = (nested as { code?: unknown }).code;
      if (typeof c === "string" && c.length > 0) return c;
    }
  }
  return null;
}

/**
 * Error thrown by the axios response interceptor for failed API calls.
 * ``code`` mirrors the backend's ``error.code`` field (e.g.
 * ``"TIINGO_NO_API_KEY"``); ``status`` is the HTTP status. Both are optional
 * since not every failure has them (network errors, timeouts).
 *
 * Backwards-compatible: existing callers that only read ``.message`` work
 * unchanged because ``ApiError extends Error``.
 */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
