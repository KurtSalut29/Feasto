"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { apiRequest, type ApiResult } from "@/lib/browser-api";

/**
 * The browser's passkey prompt (fingerprint, face or screen lock). The options come from Feasto,
 * the device signs them, and Feasto checks the signature: nothing secret leaves the device.
 */

export const passkeysWork = () => typeof window !== "undefined" && browserSupportsWebAuthn();

/** What went wrong at the prompt, in plain words */
function promptProblem(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "The passkey prompt was closed or timed out. Try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for your account.";
  if (name === "SecurityError") return "Passkeys don't work on this address. Open Feasto through its https link.";
  return "This device couldn't use a passkey. Use a code instead.";
}

type Problem = { ok: false; error: string };

/** During login: sign in with a passkey (or make one, when setting up the second step) */
export async function passkeyLoginStep<T>(token: string, remember: boolean): Promise<ApiResult<T> | Problem> {
  const options = await apiRequest<{ options: unknown; mode: "create" | "get" }>("/auth/two-step/passkey/options", { method: "POST", body: { token } });
  if (!options.ok) return { ok: false, error: options.error };
  let response: unknown;
  try {
    response =
      options.data.mode === "create"
        ? await startRegistration({ optionsJSON: options.data.options as Parameters<typeof startRegistration>[0]["optionsJSON"] })
        : await startAuthentication({ optionsJSON: options.data.options as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
  } catch (error) {
    return { ok: false, error: promptProblem(error) };
  }
  return apiRequest<T>("/auth/two-step/passkey", { method: "POST", body: { token, response, remember } });
}

/** Logged in: add a passkey for this device */
export async function addPasskey(): Promise<{ ok: true } | Problem> {
  const options = await apiRequest<{ options: unknown }>("/auth/passkeys/options", { method: "POST" });
  if (!options.ok) return { ok: false, error: options.error };
  let response: unknown;
  try {
    response = await startRegistration({ optionsJSON: options.data.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
  } catch (error) {
    return { ok: false, error: promptProblem(error) };
  }
  const saved = await apiRequest("/auth/passkeys", { method: "POST", body: { response } });
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}
