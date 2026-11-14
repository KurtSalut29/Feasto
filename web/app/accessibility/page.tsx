import { Accessibility } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AccessibilityStatement } from "@/components/app/accessibility-statement";

export const metadata: Metadata = {
  title: "Accessibility",
  description: "How Feasto is made usable for everyone: the standard it follows, its accessibility settings, and how it was tested.",
};

/**
 * Feasto's accessibility statement, open to everyone (no login), linked from the login page (the
 * same text opens in a pop-up on Display & accessibility). Says what standard is followed, what helps, how it was tested,
 * and what's still not perfect.
 */
export default function AccessibilityPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
            <Image src="/Logo/feasto-logo.png" alt="Feasto home" width={122} height={36} className="h-9 w-[122px] object-contain" priority />
          </Link>
          <Link href="/" className="text-sm font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-500">
            Back to Feasto
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
          <Accessibility className="size-5" aria-hidden />
          Accessibility
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance text-ink md:text-4xl">Feasto is made to be used by everyone</h1>
        <p className="mt-3 text-lg text-pretty text-muted">
          Residents, riders, store owners and the admin all use Feasto, on all kinds of phones, eyes and hands. This page says how we make it work for each of them.
        </p>

        <AccessibilityStatement />
      </main>
    </div>
  );
}

