import { CakeSlice, Coffee, IceCreamCone, Pizza, Sandwich, Soup, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Food stickers floating beside the card on big screens (decoration only). */
const STICKERS: { Icon: LucideIcon; className: string; delay: string }[] = [
  { Icon: Pizza, className: "top-[13%] left-[13%] -rotate-12", delay: "0s" },
  { Icon: Soup, className: "top-[48%] left-[6%] rotate-6", delay: "-2.5s" },
  { Icon: Coffee, className: "bottom-[13%] left-[17%] rotate-12", delay: "-5s" },
  { Icon: CakeSlice, className: "top-[15%] right-[14%] rotate-12", delay: "-1.2s" },
  { Icon: IceCreamCone, className: "top-[50%] right-[6%] -rotate-6", delay: "-3.8s" },
  { Icon: Sandwich, className: "right-[16%] bottom-[12%] -rotate-12", delay: "-6s" },
];

// One column, sized to fit a laptop screen at 100% zoom without scrolling.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#fbf8f6] px-4 py-3">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 -left-40 size-[560px] rounded-full bg-brand-500/[0.13] blur-3xl" />
        <div className="absolute -right-40 -bottom-56 size-[600px] rounded-full bg-amber-400/[0.16] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(31,45,61,0.07)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)] bg-[size:22px_22px]" />
        {STICKERS.map(({ Icon, className, delay }) => (
          <div key={className} className={`absolute hidden lg:block ${className}`}>
            <div
              style={{ animationDelay: delay }}
              className="flex size-14 items-center justify-center rounded-2xl bg-white/85 text-brand-500 shadow-[0_12px_30px_-12px_rgba(178,58,0,0.35)] ring-1 ring-black/[0.04] motion-safe:animate-drift"
            >
              <Icon className="size-7" strokeWidth={1.75} />
            </div>
          </div>
        ))}
      </div>

      <main className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white bg-white/95 px-5 pt-5 pb-4 shadow-[0_28px_70px_-28px_rgba(178,58,0,0.35),0_2px_8px_rgba(16,24,40,0.05)] backdrop-blur-xl motion-safe:animate-rise-in sm:px-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-orange-400 to-amber-400" />
        <Link
          href="/login"
          className="mx-auto block w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={122} height={36} className="h-9 w-auto" priority />
        </Link>
        <div className="mt-3">{children}</div>
      </main>
    </div>
  );
}
