import { HandCoins, Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Stars } from "@/components/app/rating";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { RIDER_ISSUES } from "@/lib/rider-ratings";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Ratings" };

type RatingsResponse = {
  average: number | null;
  count: number;
  stars: { stars: number; count: number }[];
  tags: { tag: string; count: number }[];
  tips: { total: number; count: number };
  ratings: {
    id: string;
    rating: number;
    tags: string[];
    comment: string | null;
    createdAt: string;
    author: string;
    orderId: string;
    storeName: string;
    tip: number;
  }[];
};

const ISSUES = new Set<string>(RIDER_ISSUES);

export default function RiderRatingsPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderRatings />
    </Suspense>
  );
}

/**
 * What residents said about the rider's deliveries: the average and how it's made up, what they
 * praise most (and what to work on), the tips, then each rating with its note.
 */
async function RiderRatings() {
  await requireRole("RIDER");
  const data = await serverApi<RatingsResponse>("/rider/ratings");
  const heading = <MobileHeading title="Ratings" subtitle="What residents say after you deliver." />;

  if (data.count === 0) {
    return (
      <>
        {heading}
        <EmptyState
          Icon={Star}
          title="No ratings yet"
          text="After a delivery arrives, the resident can rate you and add a tip. Their ratings and notes show here."
          action={<ButtonLink href="/rider">See jobs</ButtonLink>}
        />
      </>
    );
  }

  const praise = data.tags.filter((t) => !ISSUES.has(t.tag));
  const issues = data.tags.filter((t) => ISSUES.has(t.tag));

  return (
    <div className="md:max-w-3xl">
      {heading}

      <section aria-label="Your rating" className="mb-5 rounded-3xl border border-line p-4">
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-[2.5rem] leading-none font-bold tracking-tight text-ink tabular-nums">{data.average!.toFixed(1)}</p>
            <div className="mt-1.5">
              <Stars value={Math.round(data.average!)} size="size-3.5" />
            </div>
            <p className="mt-1 text-xs text-muted">
              {data.count} {data.count === 1 ? "rating" : "ratings"}
            </p>
          </div>
          <ul className="flex-1 space-y-1" aria-label="Ratings by stars">
            {data.stars.map(({ stars, count }) => (
              <li key={stars} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-right font-medium text-muted">{stars}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${(count / data.count) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-muted tabular-nums">{count}</span>
                <span className="sr-only">
                  {count === 1 ? "rating" : "ratings"} with {stars} stars
                </span>
              </li>
            ))}
          </ul>
        </div>
        {data.tips.count > 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            <HandCoins className="size-5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              <strong className="tabular-nums">{formatPeso(data.tips.total)}</strong> in tips from {data.tips.count}{" "}
              {data.tips.count === 1 ? "delivery" : "deliveries"}. They&apos;re part of your earnings.
            </span>
          </p>
        )}
      </section>

      {(praise.length > 0 || issues.length > 0) && (
        <section className="mb-5 grid gap-3 sm:grid-cols-2">
          {praise.length > 0 && <TagCounts title="What residents like" tags={praise} tone="good" />}
          {issues.length > 0 && <TagCounts title="To work on" tags={issues} tone="bad" />}
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold tracking-wider text-gray-500 uppercase">Latest ratings</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {data.ratings.map((r) => (
          <li key={r.id} className="flex gap-3 px-4 py-3">
            <Avatar name={r.author} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink">{r.author}</p>
                <span className="shrink-0 text-xs text-gray-500">{timeAgo(r.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Stars value={r.rating} size="size-3" />
                <span className="text-xs text-muted">
                  {r.storeName} · {orderCode(r.orderId)}
                </span>
              </div>
              {r.tags.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="What they picked">
                  {r.tags.map((t) => (
                    <li
                      key={t}
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${ISSUES.has(t) ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {r.comment && <p className="mt-1.5 text-sm text-ink">“{r.comment}”</p>}
              {r.tip > 0 && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <HandCoins className="size-3.5" aria-hidden />
                  Tipped you {formatPeso(r.tip)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {data.ratings.length < data.count && <p className="mt-4 text-center text-xs text-muted">Showing your latest {data.ratings.length} ratings.</p>}
    </div>
  );
}

function TagCounts({ title, tags, tone }: { title: string; tags: { tag: string; count: number }[]; tone: "good" | "bad" }) {
  const top = tags[0].count;
  return (
    <div className="rounded-2xl border border-line p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      <ul className="space-y-2">
        {tags.map((t) => (
          <li key={t.tag} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-ink">{t.tag}</span>
              <span className="text-muted tabular-nums">{t.count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className={`h-full rounded-full ${tone === "good" ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${(t.count / top) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
