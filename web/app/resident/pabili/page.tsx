import { ChevronRight, ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Address } from "@/lib/types";
import { ERRAND_STATUS, type Errand } from "./errand";
import { PabiliForm } from "./pabili-form";

export const metadata: Metadata = { title: "Pabili" };

export default function PabiliPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Pabili />
    </Suspense>
  );
}

/**
 * Pabili: a rider buys from a shop that isn't on Feasto (a sari-sari store, the market, a
 * pharmacy) and brings it. The resident lists what to buy and a budget instead of messaging
 * item by item; the rider pays at the shop and is paid back in cash on delivery.
 */
async function Pabili() {
  await requireRole("RESIDENT");
  const [{ addresses }, { errands, budgetMax, waitMinutes }] = await Promise.all([
    serverApi<{ addresses: Address[] }>("/me/addresses"),
    serverApi<{ errands: (Errand & { rider: { name: string } | null })[]; budgetMax: number; waitMinutes: number }>("/errands"),
  ]);

  return (
    <>
      <MobileHeading title="Pabili" subtitle="A rider buys it for you at a shop that isn't on Feasto, like the market or a drugstore, and brings it." />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-6">
        <PabiliForm addresses={addresses} budgetMax={budgetMax} waitMinutes={waitMinutes} />

        <section aria-labelledby="my-pabili" className="mt-6 lg:sticky lg:top-24 lg:mt-0">
          <h2 id="my-pabili" className="mb-2 font-semibold text-ink">
            Your Pabili
          </h2>
          {errands.length === 0 ? (
            <p className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
              <ShoppingBasket className="size-5 shrink-0 text-brand-600" aria-hidden />
              What you ask for shows up here, with the rider on the way.
            </p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {errands.map((e) => (
                <li key={e.id}>
                  <Link href={`/resident/pabili/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{e.shopName}</span>
                      <span className="block truncate text-sm text-muted">
                        {e.items.length} {e.items.length === 1 ? "thing" : "things"} · up to {formatPeso(e.budget)} · {timeAgo(e.createdAt)}
                      </span>
                    </span>
                    <Badge tone={ERRAND_STATUS[e.status].tone}>{ERRAND_STATUS[e.status].label}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
