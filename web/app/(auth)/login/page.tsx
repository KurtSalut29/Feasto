import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1 text-balance text-center text-[15px] text-muted">Log in to order, deliver or manage your store.</p>

      <LoginForm />

      <p className="mt-4 text-center text-sm text-muted">
        New to Feasto?{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
