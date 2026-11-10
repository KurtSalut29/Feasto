export type FieldErrors = Record<string, string[] | undefined>;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fieldErrors?: FieldErrors };

/**
 * What went wrong, in words anyone can follow, for when the API didn't explain it itself
 * (e.g. the server was restarting). Never a bare code like "404 Not Found".
 */
export function plainError(status: number) {
  if (status === 0) return "You seem to be offline, or Feasto can't be reached. Check your internet connection and try again.";
  if (status === 400) return "Some details are missing or not quite right. Check what you entered and try again.";
  if (status === 401) return "You've been logged out. Please log in again to continue.";
  if (status === 403) return "Your account isn't allowed to do this.";
  if (status === 404) return "We couldn't find what you were looking for. It may have been removed.";
  if (status === 409) return "This was just changed somewhere else. Refresh the page to see the latest, then try again.";
  if (status === 413) return "That file is too big. Choose a smaller photo or PDF.";
  if (status === 429) return "That's a lot of tries in a short time. Wait a moment, then try again.";
  if (status >= 500) return "Feasto is having trouble right now, so nothing was changed. Please try again in a minute.";
  return "That didn't work. Please try again.";
}

/** Calls the Feasto API from the browser and never throws. */
export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return { ok: false, status: 0, error: plainError(0) };
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: typeof payload?.error === "string" && payload.error ? payload.error : plainError(response.status),
      fieldErrors: payload?.fieldErrors,
    };
  }
  return { ok: true, data: payload as T };
}
