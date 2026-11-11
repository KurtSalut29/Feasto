import { Coffee, Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { mealTime, weekdayLabel, type MealTime } from "@/lib/format";
import type { Address } from "@/lib/types";
import { AddressSwitcher } from "./address-switcher";

/** What Home says at each meal, by the time in Manila */
const MEALS: Record<MealTime, { Icon: LucideIcon; label: string; line: string }> = {
  breakfast: { Icon: Sunrise, label: "Breakfast time", line: "Start the day with something warm." },
  lunch: { Icon: Sun, label: "Lunch time", line: "Lunch is calling. What are you craving?" },
  merienda: { Icon: Coffee, label: "Merienda time", line: "Something sweet or salty to tide you over?" },
  dinner: { Icon: Sunset, label: "Dinner time", line: "What's for dinner tonight?" },
  late: { Icon: Moon, label: "Late night", line: "Still hungry? See which stores are still open." },
};

/**
 * The top of Home: hello by name, a line for the meal it's time for, and where the food goes.
 * The address is one line that opens a quick switcher, since every store, distance and fee below follows it.
 */
export function HomeHero({ firstName, addresses }: { firstName: string; addresses: Address[] }) {
  const meal = MEALS[mealTime()];
  return (
    <section
      aria-label="Welcome"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-[0_14px_30px_-16px_rgba(178,58,0,0.8)] md:p-8"
    >
      <span aria-hidden className="absolute -top-14 -right-12 size-48 rounded-full bg-brand-500/70 md:-top-24 md:-right-10 md:size-80" />
      <span aria-hidden className="absolute top-20 -right-4 size-16 rounded-full bg-white/10" />
      <Image
        src="/Logo/feasto-mascot.png"
        alt=""
        width={96}
        height={96}
        preload
        className="absolute top-2 -right-2 size-24 rotate-[-8deg] object-contain drop-shadow-[0_6px_8px_rgba(80,25,0,0.35)] md:top-1/2 md:right-10 md:size-40 md:-translate-y-1/2"
      />

      <div className="relative pr-24 md:pr-56">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-brand-100 uppercase">
          <meal.Icon className="size-3.5" aria-hidden />
          {weekdayLabel()} · {meal.label}
        </p>
        <h1 className="mt-1.5 text-[26px] leading-tight font-bold tracking-tight md:text-4xl">Hi, {firstName}!</h1>
        <p className="mt-1 text-sm text-white/90 md:text-base">{meal.line}</p>
      </div>

      <div className="relative md:max-w-lg">
        <AddressSwitcher addresses={addresses} />
      </div>
    </section>
  );
}
