import { CalendarDays, Clock, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { storeState } from "@/components/app/store-status";
import { formatHours, greeting } from "@/lib/format";

type HeroStore = {
  name: string;
  imageUrl: string | null;
  opensAt: string;
  closesAt: string;
  isTemporarilyClosed: boolean;
  acceptsReservations: boolean;
};

/**
 * The top of the store's Overview, in the same family as the resident's and rider's Home: who's
 * signed in, their store and whether it's open, and three shortcuts into the store's setup.
 * The mascot has its own corner, so nothing on the card sits under it.
 */
export function VendorHero({
  firstName,
  storeType,
  store,
  live,
  dishes,
  bookings,
}: {
  firstName: string;
  storeType: string;
  store: HeroStore;
  live: boolean;
  dishes: number;
  bookings: number;
}) {
  const { open, label } = storeState(store);
  const facts: { href: string; Icon: LucideIcon; text: string }[] = [
    { href: "/vendor/menu", Icon: UtensilsCrossed, text: `${dishes} ${dishes === 1 ? "dish" : "dishes"} on the menu` },
    { href: "/vendor/store", Icon: Clock, text: formatHours(store) },
    ...(store.acceptsReservations
      ? [{ href: "/vendor/reservations", Icon: CalendarDays, text: `${bookings} upcoming ${bookings === 1 ? "booking" : "bookings"}` }]
      : []),
  ];

  return (
    <section
      aria-label="Your store"
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

      <div className="relative flex flex-col gap-4 p-5 pr-24 sm:flex-row sm:items-center sm:pr-32 md:p-7 md:pr-48">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-white/15 ring-4 ring-white/25 md:size-20">
          {store.imageUrl ? (
            <Image src={store.imageUrl} alt="" fill unoptimized className="object-cover" />
          ) : (
            <Store className="absolute inset-0 m-auto size-8 text-white/80" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight md:text-[30px]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-white/90">
            <span className="font-semibold">{store.name}</span>
            <span aria-hidden>·</span>
            {storeType}
            {live && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${open ? "bg-white text-emerald-700" : "bg-black/15 text-white ring-1 ring-white/25"}`}
              >
                <span className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-white/70"}`} aria-hidden />
                {label}
              </span>
            )}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {facts.map(({ href, Icon, text }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
