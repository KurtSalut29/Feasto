import { CakeSlice, IceCreamCone, Pizza, Sandwich, Soup, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** The chef mascot waving residents in, from the Login and sign up design */
const CHEF = "/Login and sign up/Cheerful Orange Apron Chef Mascot.png";

/** Food stickers floating around the page on big screens (decoration only). */
const STICKERS: { Icon: LucideIcon; className: string; delay: string }[] = [
  { Icon: Pizza, className: "top-[7%] left-[9%] -rotate-12", delay: "0s" },
  { Icon: Soup, className: "top-[44%] left-[3%] rotate-6", delay: "-2.5s" },
  { Icon: CakeSlice, className: "top-[5%] right-[4%] rotate-12", delay: "-1.2s" },
  { Icon: IceCreamCone, className: "top-[48%] right-[4%] -rotate-6", delay: "-3.8s" },
  { Icon: Sandwich, className: "right-[16%] bottom-[12%] -rotate-12", delay: "-6s" },
];

/** Little orange motion lines beside the chef's head, like in a comic: separate dashes fanning out */
function Sparks({ className, side }: { className: string; side: "left" | "right" }) {
  const dashes =
    side === "right"
      ? ["h-2.5 w-8 -rotate-[62deg] translate-x-0", "h-2.5 w-10 -rotate-[28deg] translate-x-5 translate-y-1"]
      : ["h-2.5 w-9 rotate-[28deg] translate-x-2", "h-2.5 w-8 -rotate-[22deg] translate-y-2"];
  return (
    <span aria-hidden className={`absolute flex flex-col gap-4 ${className}`}>
      {dashes.map((d) => (
        <span key={d} className={`block rounded-full bg-brand-500 ${d}`} />
      ))}
    </span>
  );
}

// Big screens: the chef on the left, gesturing at the card on the right. Phones: the chef peeks
// over the card. Sized to fit a laptop screen at 100% zoom without scrolling.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-[#fff1e6] via-[#fdf7f2] to-[#fff3dc] px-4 py-3">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 -left-40 size-[560px] rounded-full bg-brand-500/[0.10] blur-3xl" />
        <div className="absolute -right-40 -bottom-56 size-[600px] rounded-full bg-amber-400/[0.16] blur-3xl" />
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

      <div className="flex w-full max-w-[1040px] items-center justify-center lg:justify-between lg:gap-4">
        {/* Big screens: the chef, with a warm sun behind and his hand reaching toward the card */}
        <div aria-hidden className="relative hidden flex-1 items-center justify-end lg:flex">
          <div className="relative aspect-[1200/1311] h-[min(82dvh,640px)] motion-safe:animate-rise-in">
            <div className="absolute -bottom-[22%] -left-[16%] -z-10 aspect-square w-[105%] rounded-full bg-gradient-to-tr from-orange-300/55 via-orange-200/40 to-amber-100/0" />
            <Sparks className="top-[3%] right-[14%]" side="right" />
            <Sparks className="top-[40%] -left-[2%]" side="left" />
            <Image src={CHEF} alt="" fill priority sizes="(min-width: 1024px) 600px, 0px" className="object-contain drop-shadow-[0_24px_30px_rgba(178,58,0,0.18)]" />
          </div>
        </div>

        <div className="relative w-full max-w-[420px] shrink-0">
          {/* Phones and tablets: the chef peeks over the card */}
          <Image
            src={CHEF}
            alt=""
            width={120}
            height={131}
            priority
            className="relative z-10 mx-auto -mb-5 h-[104px] w-auto object-contain drop-shadow-[0_10px_14px_rgba(178,58,0,0.2)] lg:hidden"
          />
          <main className="relative w-full overflow-hidden rounded-[28px] border border-white bg-white/95 px-5 pt-5 pb-4 shadow-[0_28px_70px_-28px_rgba(178,58,0,0.35),0_2px_8px_rgba(16,24,40,0.05)] backdrop-blur-xl motion-safe:animate-rise-in sm:px-8">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-orange-400 to-amber-400" />
            <Link href="/login" className="mx-auto block w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
              <Image src="/Logo/feasto-logo.png" alt="Feasto" width={122} height={36} className="h-9 w-[122px] object-contain" priority />
            </Link>
            <div className="mt-3">{children}</div>
          </main>
          <footer className="mt-3 text-center text-sm">
            <Link href="/accessibility" className="rounded font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500">
              Accessibility
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
