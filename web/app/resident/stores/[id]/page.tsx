import { Bike, CalendarDays, ChevronRight, Clock, MapPin, MessageSquareText, Navigation, Star, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { JumpLink } from "@/components/app/jump-link";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { Stars } from "@/components/app/rating";
import { StoreCover } from "@/components/app/store-card";
import { storeState } from "@/components/app/store-status";
import { FeastoMap } from "@/components/map/feasto-map";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, formatTime } from "@/lib/format";
import { distanceKm, formatDistance, pinOf } from "@/lib/geo";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_ICON } from "@/lib/store-type-icons";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { Address, Cart, StoreDetail } from "@/lib/types";
import { ReviewList } from "./review-list";
import { StoreMenu } from "./store-menu";

export const metadata: Metadata = { title: "Store" };

export default function StorePage({ params }: PageProps<"/resident/stores/[id]">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <StoreView params={params} />
    </Suspense>
  );
}

/**
 * A store reads top to bottom the way a resident decides: is it good, near and open, then
 * the menu (the main thing), then the details (hours, address, map) and what others said.
 */
async function StoreView({ params }: Pick<PageProps<"/resident/stores/[id]">, "params">) {
  await requireRole("RESIDENT");
  const { id } = await params;
  const [{ store }, { cart }, { addresses }] = await Promise.all([
    serverApi<{ store: StoreDetail }>(`/stores/${id}`),
    serverApi<{ cart: Cart }>("/cart"),
    serverApi<{ addresses: Address[] }>("/me/addresses"),
  ]);
  const storePin = pinOf(store.latitude, store.longitude);
  const address = addresses.find((a) => a.isDefault);
  const homePin = address ? pinOf(address.latitude, address.longitude) : null;
  const distance = storePin && homePin ? distanceKm(storePin, homePin) : null;
  const quantities = Object.fromEntries(cart.groups.find((g) => g.store.id === store.id)?.items.map((i) => [i.menuItemId, i.quantity]) ?? []);
  const { open, label } = storeState(store);
  const status = open ? `Open until ${formatTime(store.closesAt)}` : label;
  const closedText = store.isTemporarilyClosed ? "Not taking orders right now" : `Ordering opens at ${formatTime(store.opensAt)}`;
  const TypeIcon = STORE_TYPE_ICON[store.storeType];

  return (
    <>
      <div className="relative -mx-4 -mt-5">
        <StoreCover imageUrl={store.imageUrl} Icon={TypeIcon} className="aspect-[16/9]" eager />
        <div className="absolute top-3 right-3">
          <FavoriteButton key={String(store.isFavorite)} storeId={store.id} storeName={store.name} isFavorite={store.isFavorite} />
        </div>
      </div>

      {/* The name card overlaps the photo a little */}
      <div className="relative -mx-4 -mt-6 rounded-t-3xl bg-white px-4 pt-5">
        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">{store.name}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={`inline-flex items-center gap-1.5 font-semibold ${open ? "text-emerald-700" : "text-gray-600"}`}>
            <span className={`size-2 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden />
            {status}
          </span>
          <span className="text-muted" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-muted">
            <TypeIcon className="size-3.5" aria-hidden />
            {STORE_TYPE_LABEL[store.storeType]}
          </span>
        </p>
        {store.description && <p className="mt-3 text-[15px] leading-relaxed text-ink">{store.description}</p>}

        <dl className="mt-4 grid auto-cols-fr grid-flow-col divide-x divide-line rounded-2xl border border-line py-3 text-center">
          <Fact
            jumpTo="reviews"
            label={store.rating !== null ? `${store.ratingCount} ${store.ratingCount === 1 ? "rating" : "ratings"}` : "No ratings yet"}
            value={
              store.rating !== null ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  {store.rating.toFixed(1)}
                </span>
              ) : (
                "New"
              )
            }
          />
          {distance !== null && address && <Fact label={`from ${address.label}`} value={formatDistance(distance)} />}
          <Fact label="delivery fee" value={formatPeso(store.deliveryFee)} />
        </dl>

        <div className="mt-3 flex gap-2">
          {store.canBook && (
            <ButtonLink href={`/resident/stores/${store.id}/book`} variant="secondary" className="flex-1 px-3">
              <CalendarDays className="size-5 text-brand-600" aria-hidden />
              Book a table
            </ButtonLink>
          )}
          <JumpLink to="info" className={`${buttonClass("secondary")} flex-1 px-3`}>
            <MapPin className="size-5 text-brand-600" aria-hidden />
            Hours &amp; map
          </JumpLink>
        </div>
      </div>

      {!open && (
        <div className="mt-4">
          <Alert tone="pending" title={store.isTemporarilyClosed ? "Not taking orders right now" : "Closed right now"}>
            {store.isTemporarilyClosed
              ? "The store paused orders for now. You can still look at the menu and save the store."
              : `You can look at the menu now. Ordering opens at ${formatTime(store.opensAt)}.`}
          </Alert>
        </div>
      )}

      {store.menuItems.length === 0 ? (
        <EmptyState Icon={UtensilsCrossed} title="No dishes yet" text="This store hasn't added its menu yet. Save it with the heart to find it again later." />
      ) : (
        <StoreMenu
          storeName={store.name}
          otherStores={cart.groups.filter((g) => g.store.id !== store.id).length}
          items={store.menuItems} quantities={quantities} ordering={{ canOrder: open, closedText }} />
      )}

      <StoreInfo store={store} status={status} open={open} distance={distance} address={address} storePin={storePin} homePin={homePin} />
      <Reviews store={store} />
      {/* Room at the end so the cart bar never covers the last review */}
      <div className="h-16" aria-hidden />
    </>
  );
}

function Fact({ value, label, jumpTo }: { value: ReactNode; label: string; jumpTo?: string }) {
  const body = (
    <>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
      <dd className="text-[15px] font-bold text-ink">{value}</dd>
    </>
  );
  return jumpTo ? (
    <JumpLink to={jumpTo} className="flex flex-col-reverse px-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand-500">
      {body}
    </JumpLink>
  ) : (
    <div className="flex flex-col-reverse px-2">{body}</div>
  );
}

function InfoRow({ Icon, label, children }: { Icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
      <dt className="w-[4.5rem] shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * Where and when, in one card: the map with the address and a way to get there on top,
 * then hours, delivery and bookings as label and answer rows that are quick to scan.
 */
function StoreInfo({
  store,
  status,
  open,
  distance,
  address,
  storePin,
  homePin,
}: {
  store: StoreDetail;
  status: string;
  open: boolean;
  distance: number | null;
  address?: Address;
  storePin: ReturnType<typeof pinOf>;
  homePin: ReturnType<typeof pinOf>;
}) {
  return (
    <section id="info" tabIndex={-1} aria-labelledby="info-heading" className="mt-10 scroll-mt-20 outline-none">
      <h2 id="info-heading" className="text-xl font-bold text-ink">
        Store info
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line">
        {storePin && (
          <FeastoMap
            pins={[
              { id: "store", kind: "store", at: storePin, label: store.name },
              ...(homePin ? [{ id: "home", kind: "home" as const, at: homePin, label: address?.label }] : []),
            ]}
            label={`Map showing ${store.name}${homePin ? " and your address" : ""}`}
            className="h-48"
          />
        )}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <MapPin className="size-5 shrink-0 text-brand-600" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink">{store.address}</p>
            {distance !== null && address && (
              <p className="text-muted">
                {formatDistance(distance)} from {address.label}
              </p>
            )}
          </div>
          {storePin && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${storePin.lat},${storePin.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Navigation className="size-4 text-brand-600" aria-hidden />
              Directions
              <span className="sr-only">(opens Google Maps)</span>
            </a>
          )}
        </div>
        <dl className="divide-y divide-line">
          <InfoRow Icon={Clock} label="Hours">
            <span className="block whitespace-nowrap">
              {formatTime(store.opensAt)} – {formatTime(store.closesAt)}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
              <span className={`inline-flex items-center gap-1.5 font-semibold ${open ? "text-emerald-700" : "text-gray-600"}`}>
                <span className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden />
                {status}
              </span>
              <span className="text-muted">· every day</span>
            </span>
          </InfoRow>
          <InfoRow Icon={Bike} label="Delivery">
            {formatPeso(store.deliveryFee)} per store
          </InfoRow>
          <InfoRow Icon={Store} label="Pickup">
            Free. Collect it at the store when it&apos;s ready.
          </InfoRow>
          {store.canBook && (
            <InfoRow Icon={CalendarDays} label="Bookings">
              <Link href={`/resident/stores/${store.id}/book`} className="inline-flex items-center gap-0.5 font-semibold text-brand-700 hover:underline">
                Book a table for up to {store.maxPartySize}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </InfoRow>
          )}
        </dl>
      </div>
    </section>
  );
}

/**
 * How residents rated the store: the average and how the stars are spread (so one bad
 * night doesn't hide among good ones), then what they wrote.
 */
function Reviews({ store }: { store: StoreDetail }) {
  const breakdown = store.ratingBreakdown;
  const most = Math.max(1, ...Object.values(breakdown));
  return (
    <section id="reviews" tabIndex={-1} aria-labelledby="reviews-heading" className="mt-10 scroll-mt-20 outline-none">
      <h2 id="reviews-heading" className="text-xl font-bold text-ink">
        Ratings &amp; reviews
      </h2>
      {store.rating === null ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-canvas px-4 py-4 text-sm text-muted">
          <MessageSquareText className="size-5 shrink-0" aria-hidden />
          No ratings yet. Order and be the first to rate {store.name}!
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-5 rounded-2xl border border-line p-4">
            <div className="shrink-0 text-center">
              <p className="text-4xl leading-none font-bold text-ink">{store.rating.toFixed(1)}</p>
              <div className="mt-1.5">
                <Stars value={Math.round(store.rating)} size="size-3.5" />
              </div>
              <p className="mt-1 text-xs text-muted">
                {store.ratingCount} {store.ratingCount === 1 ? "rating" : "ratings"}
              </p>
            </div>
            <ul className="min-w-0 flex-1 space-y-1" aria-label="How many residents gave each number of stars">
              {(["5", "4", "3", "2", "1"] as const).map((n) => (
                <li key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-right font-semibold text-ink">{n}</span>
                  <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(breakdown[n] / most) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right text-muted tabular-nums">
                    {breakdown[n]}
                    <span className="sr-only"> with {n} stars</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {store.reviews.length > 0 ? (
            <ReviewList reviews={store.reviews} />
          ) : (
            <p className="mt-3 text-sm text-muted">Nobody has written a review yet, only star ratings.</p>
          )}
        </>
      )}
    </section>
  );
}
