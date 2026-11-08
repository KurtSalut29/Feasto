import { UtensilsCrossed } from "lucide-react";
import Image from "next/image";

/** A dish's photo, or a plate-and-utensils mark when the store hasn't added one, so every dish has a picture spot. */
export function DishPhoto({
  src,
  className = "",
  dim,
  eager,
  sizes = "96px",
}: {
  src: string | null;
  className?: string;
  /** Greyed out, for sold-out dishes */
  dim?: boolean;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <span className={`relative block overflow-hidden bg-brand-50 ${className}`}>
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          className={`object-cover ${dim ? "opacity-60 grayscale" : ""}`}
        />
      ) : (
        <UtensilsCrossed className="absolute inset-0 m-auto size-1/3 text-brand-600/40" aria-hidden />
      )}
    </span>
  );
}
