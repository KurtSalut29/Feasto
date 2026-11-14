import { CakeSlice, IceCreamCone, Pizza, Sandwich, Soup, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AccessibilityButton } from "./accessibility-button";
import { AuthReady } from "./auth-ready";

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

/** Waits this long before its opening animation (globals.css, "Login and sign-up" section) */
const after = (seconds: number) => ({ "--fx-delay": `${seconds}s` }) as CSSProperties;

/** Little orange motion lines beside the chef's head, like in a comic: separate dashes fanning out */
function Sparks({ className, side, delay }: { className: string; side: "left" | "right"; delay: number }) {
  const dashes =
    side === "right"
      ? ["h-2.5 w-8 -rotate-[62deg] translate-x-0", "h-2.5 w-10 -rotate-[28deg] translate-x-5 translate-y-1"]
      : ["h-2.5 w-9 rotate-[28deg] translate-x-2", "h-2.5 w-8 -rotate-[22deg] translate-y-2"];
  return (
    <span aria-hidden style={after(delay)} className={`fx-auth-spark absolute flex flex-col gap-4 ${className}`}>
      {dashes.map((d) => (
        <span key={d} className={`block rounded-full bg-brand-500 ${d}`} />
      ))}
    </span>
  );
}

// Big screens: the chef on the left, gesturing at the card on the right. Phones: the chef peeks
// over the card. Sized to fit a laptop screen at 100% zoom without scrolling.
// Opening the page: the chef comes in waving, his sun glows up behind him, the card rises and its
// content follows line by line. Between Log in and Create account the card changes size smoothly
// (each part below has a view-transition name for that, styled in globals.css).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-[#fff1e6] via-[#fdf7f2] to-[#fff3dc] px-4 py-3">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="fx-auth-glow absolute -top-48 -left-40 size-[560px] rounded-full bg-brand-500/[0.10] blur-3xl" />
        <div className="fx-auth-glow absolute -right-40 -bottom-56 size-[600px] rounded-full bg-amber-400/[0.16] blur-3xl" style={after(0.2)} />
        {STICKERS.map(({ Icon, className, delay }, i) => (
          <div key={className} className={`absolute hidden lg:block ${className}`}>
            <div className="fx-auth-sticker" style={after(0.9 + i * 0.12)}>
              <div
                style={{ animationDelay: delay }}
                className="flex size-14 items-center justify-center rounded-2xl bg-white/85 text-brand-500 shadow-[0_12px_30px_-12px_rgba(178,58,0,0.35)] ring-1 ring-black/[0.04] motion-safe:animate-drift"
              >
                <Icon className="size-7" strokeWidth={1.75} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex w-full max-w-[1040px] items-center justify-center lg:justify-between lg:gap-4">
        {/* Big screens: the chef, with a warm sun behind and his hand reaching toward the card */}
        <div aria-hidden className="relative hidden flex-1 items-center justify-end lg:flex">
          <div className="relative aspect-[1200/1311] h-[min(82dvh,640px)]">
            <div
              className="fx-auth-sun absolute -bottom-[22%] -left-[16%] -z-10 aspect-square w-[105%] rounded-full bg-gradient-to-tr from-orange-300/55 via-orange-200/40 to-amber-100/0"
              style={after(0.15)}
            />
            <div className="fx-auth-chef absolute inset-0" style={after(0.1)}>
              <Image src={CHEF} alt="" fill priority sizes="(min-width: 1024px) 600px, 0px" className="object-contain drop-shadow-[0_24px_30px_rgba(178,58,0,0.18)]" />
            </div>
            <Sparks className="top-[3%] right-[14%]" side="right" delay={1} />
            <Sparks className="top-[40%] -left-[2%]" side="left" delay={1.15} />
          </div>
        </div>

        <div className="relative w-full max-w-[420px] shrink-0">
          {/* Phones and tablets: the chef pops up from behind the card */}
          <div className="relative z-10 mx-auto -mb-5 w-fit lg:hidden" style={{ viewTransitionName: "auth-chef" }}>
            <Image
              src={CHEF}
              alt=""
              width={120}
              height={131}
              priority
              style={after(0.55)}
              className="fx-auth-peek h-[104px] w-auto object-contain drop-shadow-[0_10px_14px_rgba(178,58,0,0.2)]"
            />
          </div>
          <main
            style={{ viewTransitionName: "auth-card", ...after(0.25) }}
            className="fx-auth-card relative w-full overflow-hidden rounded-[28px] border border-white bg-white/95 px-5 pt-5 pb-4 shadow-[0_28px_70px_-28px_rgba(178,58,0,0.35),0_2px_8px_rgba(16,24,40,0.05)] backdrop-blur-xl sm:px-8"
          >
            <div aria-hidden className="fx-auth-bar absolute inset-x-0 top-0 h-1 origin-left bg-gradient-to-r from-brand-500 via-orange-400 to-amber-400" style={after(0.6)} />
            <Link
              href="/login"
              style={{ viewTransitionName: "auth-logo", ...after(0.45) }}
              className="fx-auth-item mx-auto block w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Image src="/Logo/feasto-logo.png" alt="Feasto" width={122} height={36} className="h-9 w-[122px] object-contain" priority />
            </Link>
            {/* The page's own lines rise in one after another the first time (fx-auth-lines) */}
            <div className="fx-auth-lines mt-3">{children}</div>
          </main>
          <footer className="fx-auth-item mt-3 text-center text-sm" style={{ viewTransitionName: "auth-foot", ...after(1.1) }}>
            <AccessibilityButton />
          </footer>
        </div>
      </div>
      <AuthReady />
    </div>
  );
}
