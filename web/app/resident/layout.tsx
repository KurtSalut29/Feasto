import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { serverApi } from "@/lib/server-api";

export default function ResidentLayout({ children }: { children: ReactNode }) {
  return (
    <MobileShell
      role="RESIDENT"
      topBarEnd={
        <Suspense fallback={<CartLink count={0} />}>
          <CartBadge />
        </Suspense>
      }
    >
      {children}
    </MobileShell>
  );
}

async function CartBadge() {
  const { count } = await serverApi<{ count: number }>("/cart/count");
  return <CartLink count={count} />;
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      href="/resident/cart"
      aria-label={count ? `Cart, ${count} items` : "Cart"}
      className="relative flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <ShoppingCart className="size-[22px]" aria-hidden />
      {count > 0 && (
        <span className="absolute top-1 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-4 font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
