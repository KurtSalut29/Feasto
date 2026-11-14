import { ArrowRight, CircleCheck, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { greeting } from "@/lib/format";

export type Attention = { href: string; Icon: LucideIcon; text: string };

/**
 * The top of the admin's Overview, in the same family as the store's and the rider's: who's
 * signed in, how Feasto is doing in one line, and every thing that needs the admin as a chip.
 * The mascot has its own corner, so nothing on the card sits under it.
 */
export function AdminHero({ firstName, summary, attention }: { firstName: string; summary: string; attention: Attention[] }) {
  return (
    <section
      aria-label="Feasto today"
      className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-[0_18px_40px_-22px_rgba(178,58,0,0.9)]"
    >
      <span aria-hidden className="absolute -top-24 -right-20 size-80 rounded-full bg-brand-500/60" />
      <span aria-hidden className="absolute -bottom-16 left-1/3 size-40 rounded-full bg-white/5" />
      <Image
        src="/Logo/feasto-mascot.png"
        alt=""
        width={160}
        height={160}
        preload
        className="absolute top-4 right-3 size-20 rotate-[-8deg] object-contain drop-shadow-[0_8px_10px_rgba(80,25,0,0.35)] sm:size-24 md:top-1/2 md:right-10 md:size-28 md:-translate-y-1/2"
      />

      <div className="relative p-5 pr-24 sm:pr-32 md:p-7 md:pr-48">
        <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-brand-100 uppercase">Admin console</p>
        <h1 className="mt-1 text-[1.625rem] leading-tight font-bold tracking-tight md:text-[1.875rem]">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-white/90">{summary}</p>
        {attention.length ? (
          <nav aria-label="Needs your attention" className="mt-3">
            <ul className="flex flex-wrap gap-2">
              {attention.map(({ href, Icon, text }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-brand-700 shadow-[0_6px_16px_-10px_rgba(80,25,0,0.7)] transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <Icon className="size-4" aria-hidden />
                    {text}
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-semibold ring-1 ring-white/20">
            <CircleCheck className="size-4" aria-hidden />
            All caught up. Nothing needs you right now.
          </p>
        )}
      </div>
    </section>
  );
}
