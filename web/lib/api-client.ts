export type FieldErrors = Record<string, string[] | undefined>;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fieldErrors?: FieldErrors };

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
    return { ok: false, status: 0, error: "Can't reach Feasto right now. Check your connection and try again." };
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error:
        payload?.error ??
        (response.status >= 500 ? "Feasto's servers aren't responding. Please try again shortly." : "Something went wrong."),
      fieldErrors: payload?.fieldErrors,
    };
  }
  return { ok: true, data: payload as T };
}
