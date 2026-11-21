"use client";

import { ArrowRight, CircleCheck, Fingerprint, KeyRound, LockKeyhole, Mail, ShieldCheck, Smartphone } from "lucide-react";
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
import { passkeyLoginStep, passkeysWork } from "@/lib/passkey";
import { rememberCircleAt } from "@/lib/page-entrance";
import { ROLE_HOME } from "@/lib/roles";
import type { User } from "@/lib/types";

/** How long "Welcome back, …!" shows before the app opens (none for people who asked for less motion) */
const HELLO_MS = 1000;

type Methods = { app: boolean; passkey: boolean; backup: boolean };
type ThirdStep = { token: string; need: "passkey" | "code"; email: string; canEmail: boolean; hasApp: boolean };
type LoginAnswer = {
  user?: User;
  backupLeft?: number;
  twoStep?: { token: string; email: string; canEmail: boolean; methods: Methods };
  twoStepSetup?: { token: string; email: string };
  thirdStep?: ThirdStep;
};
type Method = "app" | "backup" | "email";
type Stage =
  | { kind: "password" }
  /** The second step: the passkey or a code */
  | { kind: "verify"; token: string; email: string; canEmail: boolean; methods: Methods }
  /** The admin's third step: the other one */
  | ({ kind: "third" } & ThirdStep)
  /** A required second step not set up yet: a passkey, or the app (then its QR code) */
  | { kind: "choose"; token: string }
  | { kind: "setup"; token: string; qr: { otpauthUrl: string; secret: string } | null }
  | { kind: "backup"; user: User; codes: string[] };

const link = "font-semibold text-brand-700 hover:underline";

/**
 * Logging in: the password, then (when the account has one) the second step: the passkey
 * (fingerprint, face or screen lock) or a code from the authenticator app, a backup code or an
 * emailed code. Admins, store owners and riders who haven't set one up do it here, once. With
 * three-step login on, the admin gives both: a code and the passkey.
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
  /** Typing a code instead of the passkey (when the account has both) */
  const [method, setMethod] = useState<Method | "passkey">("app");
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

  /** Where an answer leads: the app, or the next step */
  async function follow(answer: LoginAnswer, from: HTMLElement | null) {
    if (answer.thirdStep) {
      reset({ kind: "third", ...answer.thirdStep });
      setMethod(answer.thirdStep.need === "code" ? (answer.thirdStep.hasApp ? "app" : "email") : "passkey");
      return;
    }
    if (answer.twoStep) {
      reset({ kind: "verify", ...answer.twoStep });
      // The passkey first when this device can use one; otherwise the app's code
      setMethod(answer.twoStep.methods.passkey && passkeysWork() ? "passkey" : answer.twoStep.methods.app ? "app" : answer.twoStep.methods.backup ? "backup" : "email");
      return;
    }
    if (answer.twoStepSetup) return reset({ kind: "choose", token: answer.twoStepSetup.token });
    if (answer.backupLeft !== undefined && answer.backupLeft <= 2) {
      toast.later({ tone: "info", title: `${answer.backupLeft} backup codes left`, description: "Get new ones in Account › Two-step login." });
    }
    if (answer.user) await enterApp(answer.user, from);
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
    await follow(result.data, formElement);
  }

  async function signWithPasskey(from: HTMLElement | null) {
    if (stage.kind !== "verify" && stage.kind !== "third" && stage.kind !== "choose") return;
    setSubmitting(true);
    setError(undefined);
    const result = await passkeyLoginStep<LoginAnswer>(stage.token, remember);
    setSubmitting(false);
    if (!result.ok) return setError(result.error);
    if (stage.kind === "choose") toast.later({ tone: "success", title: "Passkey added", description: "Next time, log in with your password and your fingerprint or screen lock." });
    await follow(result.data, from);
  }

  async function chooseApp() {
    if (stage.kind !== "choose") return;
    const token = stage.token;
    reset({ kind: "setup", token, qr: null });
    const qr = await apiRequest<{ otpauthUrl: string; secret: string }>("/auth/two-step/setup", { method: "POST", body: { token } });
    if (!qr.ok) return setError(qr.error);
    setStage({ kind: "setup", token, qr: qr.data });
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (stage.kind === "verify" || stage.kind === "third") {
      if (method === "passkey") return signWithPasskey(formElement);
      setSubmitting(true);
      setError(undefined);
      setFieldErrors({});
      const path = stage.kind === "third" ? "/auth/two-step/third" : "/auth/two-step";
      const result = await apiRequest<LoginAnswer>(path, { method: "POST", body: { token: stage.token, method, code, remember } });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.fieldErrors ? undefined : result.error);
        return setFieldErrors(result.fieldErrors ?? {});
      }
      return follow(result.data, formElement);
    }
    if (stage.kind !== "setup") return;
    setSubmitting(true);
    setError(undefined);
    setFieldErrors({});
    const result = await apiRequest<{ user: User; backupCodes: string[] }>("/auth/two-step/setup/confirm", { method: "POST", body: { token: stage.token, code } });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      return setFieldErrors(result.fieldErrors ?? {});
    }
    reset({ kind: "backup", user: result.data.user, codes: result.data.backupCodes });
  }

  async function emailCode() {
    if (stage.kind !== "verify" && stage.kind !== "third") return;
    setError(undefined);
    const result = await apiRequest<{ minutes: number }>("/auth/two-step/email", { method: "POST", body: { token: stage.token } });
    if (!result.ok) return setError(result.error);
    setMethod("email");
    setCode("");
    toast.success("Code sent", `Check ${stage.email}. It works for ${result.data.minutes} minutes.`);
  }

  const backToPassword = (
    <button type="button" className="block w-full text-center text-sm text-muted hover:text-ink" onClick={() => (reset({ kind: "password" }), setMethod("app"))}>
      Back to email and password
    </button>
  );
  const welcomeButton = (text: string) => (
    <Button type="button" disabled className={`w-full disabled:opacity-100 ${AUTH_BUTTON}`}>
      <CircleCheck className="fx-pop-in fx-draw size-5" aria-hidden />
      <span role="status">{text}</span>
    </Button>
  );

  if (stage.kind === "backup") {
    return (
      <div className="mt-6 space-y-3.5" data-auth-action>
        <Alert tone="success" title="Two-step login is on">
          From now on, you log in with your password and a code from your app.
        </Alert>
        {welcome ? (
          welcomeButton(`Welcome, ${welcome}!`)
        ) : (
          <BackupCodes codes={stage.codes} doneLabel="I saved them: open Feasto" onDone={() => enterApp(stage.user, document.querySelector("[data-auth-action]")?.parentElement ?? null)} />
        )}
      </div>
    );
  }

  if (stage.kind === "choose") {
    const canPasskey = passkeysWork();
    return (
      <div className="mt-6 space-y-3.5">
        <div className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-sm text-ink">Your account logs in with two steps, so a stolen password isn&apos;t enough. Choose your second step (once):</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="space-y-2.5" data-auth-action>
          {welcome ? (
            welcomeButton(`Welcome, ${welcome}!`)
          ) : (
            <>
              <button
                type="button"
                disabled={!canPasskey || submitting}
                onClick={(e) => signWithPasskey(e.currentTarget.closest("div"))}
                className="flex w-full items-start gap-3 rounded-2xl border border-brand-300 bg-brand-50/60 p-4 text-left transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
              >
                <Fingerprint className="mt-0.5 size-6 shrink-0 text-brand-600" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink">{submitting ? "Waiting for your device…" : "Use a passkey (recommended)"}</span>
                  <span className="block text-sm text-muted">
                    {canPasskey ? "Your fingerprint, face or screen lock on this device. Nothing to type next time." : "This browser can't make passkeys. Use the app instead."}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={chooseApp}
                disabled={submitting}
                className="flex w-full items-start gap-3 rounded-2xl border border-line p-4 text-left transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Smartphone className="mt-0.5 size-6 shrink-0 text-gray-600" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink">Use an authenticator app</span>
                  <span className="block text-sm text-muted">Google or Microsoft Authenticator: a 6-digit code each time, with backup codes.</span>
                </span>
              </button>
            </>
          )}
        </div>
        {backToPassword}
      </div>
    );
  }

  if (stage.kind === "verify" || stage.kind === "third" || stage.kind === "setup") {
    const setup = stage.kind === "setup";
    const third = stage.kind === "third";
    const passkeyMode = method === "passkey" && !setup;
    const can = stage.kind === "verify" ? stage.methods : stage.kind === "third" ? { app: stage.hasApp && stage.need === "code", passkey: stage.need === "passkey", backup: stage.need === "code" } : null;
    return (
      <form onSubmit={submitCode} noValidate className="mt-6 space-y-3.5">
        <div className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3">
          {passkeyMode ? <Fingerprint className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden /> : <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />}
          <p className="text-sm text-ink">
            {third && <span className="block font-semibold">Last step (three-step login)</span>}
            {setup
              ? "Scan the QR code with your authenticator app, then type the code it shows:"
              : passkeyMode
                ? "Use your passkey: your fingerprint, face or screen lock on this device."
                : method === "backup"
                  ? "Type one of the backup codes you saved when you set up two-step login."
                  : method === "email"
                    ? `Type the code we emailed to ${stage.email}.`
                    : "Open your authenticator app and type the 6-digit code for Feasto."}
          </p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {setup && (stage.qr ? <SetupQr url={stage.qr.otpauthUrl} secret={stage.qr.secret} /> : <div className="h-48 animate-pulse rounded-2xl bg-canvas" />)}
        {!passkeyMode &&
          (method === "backup" && !setup ? (
            <TextField label="Backup code" name="code" placeholder="abcd-2345" icon={KeyRound} value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} error={fieldErrors.code?.[0]} autoFocus />
          ) : (
            <CodeField value={code} onChange={setCode} error={fieldErrors.code?.[0]} label={method === "email" && !setup ? "6-digit code from the email" : "6-digit code from your app"} />
          ))}
        {stage.kind === "verify" && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="size-4 accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Don&apos;t ask again on this device for 30 days
          </label>
        )}
        <div className="pt-1" data-auth-action>
          {welcome ? (
            welcomeButton(`Welcome back, ${welcome}!`)
          ) : (
            <Button type="submit" loading={submitting} className={`w-full ${AUTH_BUTTON}`}>
              {passkeyMode && <Fingerprint className="size-5" aria-hidden />}
              {setup ? "Turn on and log in" : passkeyMode ? "Use my passkey" : "Log in"}
            </Button>
          )}
        </div>
        {can && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            {can.passkey && method !== "passkey" && passkeysWork() && (
              <button type="button" className={link} onClick={() => (setMethod("passkey"), setCode(""), setError(undefined))}>
                Use my passkey
              </button>
            )}
            {can.app && method !== "app" && (
              <button type="button" className={link} onClick={() => (setMethod("app"), setCode(""), setError(undefined))}>
                Use my app
              </button>
            )}
            {can.backup && method !== "backup" && (
              <button type="button" className={link} onClick={() => (setMethod("backup"), setCode(""), setError(undefined))}>
                Use a backup code
              </button>
            )}
            {stage.kind !== "setup" && stage.canEmail && method !== "email" && (
              <button type="button" className={link} onClick={emailCode}>
                {third && stage.need === "passkey" ? "Lost your passkey? Email me a code" : "Email me a code"}
              </button>
            )}
          </div>
        )}
        {backToPassword}
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
          welcomeButton(`Welcome back, ${welcome}!`)
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
