"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/roles";
import type { User } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
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
    router.replace(ROLE_HOME[result.data.user.role]);
    router.refresh();
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
