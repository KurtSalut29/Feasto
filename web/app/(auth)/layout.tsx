import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// Sized to fit a laptop screen at 100% zoom without scrolling.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-3">
      <main className="w-full max-w-[420px] rounded-3xl border border-line bg-white px-5 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)] sm:px-8 sm:py-6">
        <Link
          href="/login"
          className="mx-auto block w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={108} height={32} className="h-8 w-auto" priority />
        </Link>
        <div className="mt-4">{children}</div>
      </main>
    </div>
  );
}
