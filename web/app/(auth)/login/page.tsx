import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthSwitch } from "../auth-ui";
import { DisabledNotice } from "./disabled-notice";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-balance text-center text-[15px] text-muted">Log in to order, deliver or manage your store.</p>

      <Suspense fallback={null}>
        <DisabledNotice />
      </Suspense>
      <LoginForm />

      <AuthSwitch question="New to Feasto?" href="/register" action="Create an account" />
    </>
  );
}
