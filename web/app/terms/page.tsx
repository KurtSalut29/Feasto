import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { TermsOfService, TERMS_UPDATED } from "@/components/app/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Feasto as a resident, food business or rider: accounts, orders, payments, cancellations and fair use.",
};

/** Feasto's Terms of Service, open to everyone (no login). The sign-up form shows the same text in a pop-up. */
export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
            <Image src="/Logo/feasto-logo.png" alt="Feasto home" width={122} height={36} className="h-9 w-[7.625rem] object-contain" priority />
          </Link>
          <nav aria-label="Feasto's policies" className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/privacy" className="text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
              Privacy Policy
            </Link>
            <Link href="/" className="text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
              Back to Feasto
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <ScrollText className="size-5" aria-hidden />
          Terms of Service
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance text-ink md:text-4xl">The rules for using Feasto</h1>
        <p className="mt-3 text-lg text-pretty text-muted">What residents, food businesses and riders agree to when they make a Feasto account, in plain words.</p>
        <p className="mt-2 text-sm text-muted">Last updated {TERMS_UPDATED}</p>

        <TermsOfService />
      </main>
    </div>
  );
}
