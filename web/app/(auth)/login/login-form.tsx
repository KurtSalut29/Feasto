"use client";

import { ArrowRight, CircleCheck, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BackupCodes, CodeField, SetupQr } from "@/components/app/two-step-setup";
import { Turnstile } from "@/components/app/turnstile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AUTH_BUTTON } from "../auth-ui";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import { lessMotion } from "@/lib/display";
import { rememberCircleAt } from "@/lib/page-entrance";
import { ROLE_HOME } from "@/lib/roles";
import type { User } from "@/lib/types";

/** How long "Welcome back, …!" shows before the app opens (none for people who asked for less motion) */
const HELLO_MS = 1000;

type LoginAnswer = { user?: User; twoStep?: { token: string; email: string; canEmail: boolean }; twoStepSetup?: { token: string; email: string } };
type Stage =
  | { kind: "password" }
  | { kind: "code"; token: string; email: string; canEmail: boolean }
  | { kind: "setup"; token: string; qr: { otpauthUrl: string; secret: string } | null }
  | { kind: "backup"; user: User; codes: string[] };

/**
 * Logging in: the password, then (when the account uses it) a code from the authenticator app.
 * Admins and store owners who haven't set the app up do it here, once, before going in.
 */
export function LoginForm() {
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** The first name, once logged in: the button says hello while the app loads */
  const [welcome, setWelcome] = useState<string>();
  const [human, setHuman] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"app" | "backup" | "email">("app");
  const [remember, setRemember] = useState(true);

  function reset(next: Stage) {
    setStage(next);
    setError(undefined);
    setFieldErrors({});
    setCode("");
  }

  async function enterApp(user: User, from: HTMLElement | null) {
    // A full page load (not router.replace) after signing in: Next.js keeps visited pages
    // alive in the background, so this clears the old form, its loading state and the
    // typed password, and makes the next visit to /login or /register check the new session.
    const first = user.name.split(" ")[0];
    setWelcome(first);
    toast.later({ tone: "success", title: `Welcome back, ${first}!`, description: "You're logged in." });
    // A moment to read the hello, then the app opens in a circle from the button (enter-app, globals.css)
    await new Promise((resolve) => setTimeout(resolve, lessMotion() ? 0 : HELLO_MS));
    rememberCircleAt(from?.querySelector("[data-auth-action]") ?? null);
    window.location.replace(ROLE_HOME[user.role]);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setError(undefined);
    setFieldErrors({});
    const result = await apiRequest<LoginAnswer>("/auth/login", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password"), turnstileToken: human ?? undefined },
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    if (result.data.twoStep) return reset({ kind: "code", ...result.data.twoStep });
    if (result.data.twoStepSetup) {
      const token = result.data.twoStepSetup.token;
      reset({ kind: "setup", token, qr: null });
      const qr = await apiRequest<{ otpauthUrl: string; secret: string }>("/auth/two-step/setup", { method: "POST", body: { token } });
      if (!qr.ok) return setError(qr.error);
      setStage({ kind: "setup", token, qr: qr.data });
      return;
    }
    if (result.data.user) await enterApp(result.data.user, formElement);
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.kind !== "code" && stage.kind !== "setup") return;
    const formElement = event.currentTarget;
    setSubmitting(true);
    setError(undefined);
    setFieldErrors({});
    if (stage.kind === "code") {
      const result = await apiRequest<{ user: User; backupLeft?: number }>("/auth/two-step", { method: "POST", body: { token: stage.token, method, code, remember } });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.fieldErrors ? undefined : result.error);
        return setFieldErrors(result.fieldErrors ?? {});
      }
      if (result.data.backupLeft !== undefined && result.data.backupLeft <= 2) {
        toast.later({ tone: "info", title: `${result.data.backupLeft} backup codes left`, description: "Get new ones in Account › Two-step login." });
      }
      return enterApp(result.data.user, formElement);
    }
    const result = await apiRequest<{ user: User; backupCodes: string[] }>("/auth/two-step/setup/confirm", { method: "POST", body: { token: stage.token, code } });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      return setFieldErrors(result.fieldErrors ?? {});
    }
    reset({ kind: "backup", user: result.data.user, codes: result.data.backupCodes });
  }

  async function emailCode() {
    if (stage.kind !== "code") return;
    setError(undefined);
    const result = await apiRequest<{ minutes: number }>("/auth/two-step/email", { method: "POST", body: { token: stage.token } });
    if (!result.ok) return setError(result.error);
    setMethod("email");
    setCode("");
    toast.success("Code sent", `Check ${stage.email}. It works for ${result.data.minutes} minutes.`);
  }

  if (stage.kind === "backup") {
    return (
      <div className="mt-6 space-y-3.5" data-auth-action>
        <Alert tone="success" title="Two-step login is on">
          From now on, you log in with your password and a code from your app.
        </Alert>
        {welcome ? (
          <Button type="button" disabled className={`w-full disabled:opacity-100 ${AUTH_BUTTON}`}>
            <CircleCheck className="fx-pop-in fx-draw size-5" aria-hidden />
            <span role="status">Welcome, {welcome}!</span>
          </Button>
        ) : (
          <BackupCodes codes={stage.codes} doneLabel="I saved them: open Feasto" onDone={() => enterApp(stage.user, document.querySelector("[data-auth-action]")?.parentElement ?? null)} />
        )}
      </div>
    );
  }

  if (stage.kind === "code" || stage.kind === "setup") {
    const setup = stage.kind === "setup";
    return (
      <form onSubmit={submitCode} noValidate className="mt-6 space-y-3.5">
        <div className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm text-ink">
            {setup
              ? "Admins and store owners log in with a code from an authenticator app too, so a stolen password isn't enough. Set it up once:"
              : method === "backup"
                ? "Type one of the backup codes you saved when you set up two-step login."
                : method === "email"
                  ? `Type the code we emailed to ${stage.kind === "code" ? stage.email : "you"}.`
                  : "Open your authenticator app and type the 6-digit code for Feasto."}
          </p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {setup && (stage.qr ? <SetupQr url={stage.qr.otpauthUrl} secret={stage.qr.secret} /> : <div className="h-48 animate-pulse rounded-2xl bg-canvas" />)}
        {method === "backup" && !setup ? (
          <TextField label="Backup code" name="code" placeholder="abcd-2345" icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} error={fieldErrors.code?.[0]} autoFocus />
        ) : (
          <CodeField value={code} onChange={setCode} error={fieldErrors.code?.[0]} label={method === "email" && !setup ? "6-digit code from the email" : "6-digit code from your app"} />
        )}
        {!setup && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Don&apos;t ask again on this device for 30 days
          </label>
        )}
        <div className="pt-1" data-auth-action>
          {welcome ? (
            <Button type="button" disabled className={`w-full disabled:opacity-100 ${AUTH_BUTTON}`}>
              <CircleCheck className="fx-pop-in fx-draw size-5" aria-hidden />
              <span role="status">Welcome back, {welcome}!</span>
            </Button>
          ) : (
            <Button type="submit" loading={submitting} className={`w-full ${AUTH_BUTTON}`}>
              {setup ? "Turn on and log in" : "Log in"}
            </Button>
          )}
        </div>
        {!setup && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            {method !== "app" && (
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => (setMethod("app"), setCode(""))}>
                Use my app
              </button>
            )}
            {method !== "backup" && (
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => (setMethod("backup"), setCode(""))}>
                Use a backup code
              </button>
            )}
            {stage.kind === "code" && stage.canEmail && (
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={emailCode}>
                Email me a code
              </button>
            )}
          </div>
        )}
        <button type="button" className="block w-full text-center text-sm text-muted hover:text-ink" onClick={() => (reset({ kind: "password" }), setMethod("app"))}>
          Back to email and password
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} noValidate className="mt-6 space-y-3.5">
      {error && <Alert tone="error">{error}</Alert>}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        icon={Mail}
        autoFocus
        required
        error={fieldErrors.email?.[0]}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        icon={LockKeyhole}
        required
        error={fieldErrors.password?.[0]}
      />
      <Turnstile onToken={setHuman} />

      <div className="pt-1" data-auth-action>
        {welcome ? (
          <Button type="button" disabled className={`w-full disabled:opacity-100 ${AUTH_BUTTON}`}>
            <CircleCheck className="fx-pop-in fx-draw size-5" aria-hidden />
            <span role="status">Welcome back, {welcome}!</span>
          </Button>
        ) : (
          <Button type="submit" loading={submitting} className={`group w-full ${AUTH_BUTTON}`}>
            {submitting ? "Logging in…" : "Log in"}
            {!submitting && <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden />}
          </Button>
        )}
      </div>
    </form>
  );
}
