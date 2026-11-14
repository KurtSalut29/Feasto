import Image from "next/image";
import type { ReactNode } from "react";

const CHEF = "/Login and sign up/Cheerful Orange Apron Chef Mascot.png";

/**
 * A whole page that explains a problem in plain words (a page that doesn't exist, or one that
 * couldn't load) and offers a way out, instead of a bare "404" or "Application error".
 */
export function ProblemScreen({ code, title, children, actions }: { code: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[#fff1e6] via-[#fdf7f2] to-[#fff3dc] px-4 py-10">
      <main className="w-full max-w-md text-center motion-safe:animate-rise-in">
        <Image src={CHEF} alt="" width={160} height={175} priority className="mx-auto h-36 w-auto drop-shadow-[0_14px_20px_rgba(178,58,0,0.18)]" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <div className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{children}</div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        {/* For whoever helps them: the technical name, kept small and out of the way */}
        <p className="mt-8 text-xs text-gray-500">Reference: {code}</p>
      </main>
    </div>
  );
}
