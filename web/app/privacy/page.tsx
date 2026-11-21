import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PrivacyPolicy, TERMS_UPDATED } from "@/components/app/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Feasto collects, why, who sees it, how long it's kept, and your rights under the Data Privacy Act of 2012.",
};

/** Feasto's Privacy Policy, open to everyone (no login). The sign-up form shows the same text in a pop-up. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
            <Image src="/Logo/feasto-logo.png" alt="Feasto home" width={122} height={36} className="h-9 w-[7.625rem] object-contain" priority />
          </Link>
          <nav aria-label="Feasto's policies" className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/terms" className="tap text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
              Terms of Service
            </Link>
            <Link href="/" className="tap text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
              Back to Feasto
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <ShieldCheck className="size-5" aria-hidden />
          Privacy Policy
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance text-ink md:text-4xl">How Feasto handles your information</h1>
        <p className="mt-3 text-lg text-pretty text-muted">What we collect, why we need it, who sees it and what you can ask us to do with it.</p>
        <p className="mt-2 text-sm text-muted">Last updated {TERMS_UPDATED}</p>

        <PrivacyPolicy />
      </main>
    </div>
  );
}
