"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/roles";
import type { User } from "@/lib/types";

export function LoginForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(undefined);
    setFieldErrors({});

    const result = await apiRequest<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });

    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      setSubmitting(false);
      return;
    }
    // A full page load (not router.replace) after signing in: Next.js keeps visited pages
    // alive in the background, so this clears the old form, its loading state and the
    // typed password, and makes the next visit to /login or /register check the new session.
    window.location.replace(ROLE_HOME[result.data.user.role]);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        error={fieldErrors.email?.[0]}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        required
        error={fieldErrors.password?.[0]}
      />

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
