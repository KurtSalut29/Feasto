import type { CSSProperties } from "react";
import type { OnlinePayment } from "@/lib/types";

export type PayChoice = "COD" | OnlinePayment;

/** A logo file in /public/payments. `color` keeps the brand's own colors; otherwise it's drawn in one color. */
export type LogoFile = { src: string; color?: boolean };

export type PaymentOption = {
  value: PayChoice;
  name: string;
  group: "Cash" | "E-wallets" | "Cards";
  /** On the white tile */
  tile?: LogoFile;
  /** On the card's face; `named` when the logo already spells the name */
  card?: LogoFile & { named?: boolean };
  /** Brand color, for one-color logos on the white tile */
  brand: string;
  /** The card's face */
  face: string;
  /** Cards: the demo card's number, masked */
  number?: string;
};

// Every way to pay, with its brand's real logo and colors. GCash, Maya and Coins.ph logos are from
// their own websites; the card networks, Grab and Shopee from Simple Icons. The marks belong to their
// owners and are shown as accepted payment methods in a simulated checkout.
export const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: "COD", name: "Cash", group: "Cash", brand: "#059669", face: "from-emerald-700 via-emerald-600 to-teal-500" },
  {
    value: "GCASH",
    name: "GCash",
    group: "E-wallets",
    tile: { src: "/payments/gcash.svg", color: true },
    card: { src: "/payments/gcash.svg" },
    brand: "#0a5cff",
    face: "from-[#0038b8] via-[#0a5cff] to-[#4d8dff]",
  },
  {
    value: "MAYA",
    name: "Maya",
    group: "E-wallets",
    tile: { src: "/payments/maya.svg", color: true },
    card: { src: "/payments/maya.svg", color: true, named: true },
    brand: "#00b464",
    face: "from-[#050505] via-[#151a17] to-[#0c3b25]",
  },
  {
    value: "GRABPAY",
    name: "GrabPay",
    group: "E-wallets",
    tile: { src: "/payments/grab.svg" },
    card: { src: "/payments/grab.svg" },
    brand: "#00B14F",
    face: "from-[#00813f] via-[#00a651] to-[#3cc77f]",
  },
  {
    value: "SHOPEEPAY",
    name: "ShopeePay",
    group: "E-wallets",
    tile: { src: "/payments/shopee.svg" },
    card: { src: "/payments/shopee.svg" },
    brand: "#EE4D2D",
    face: "from-[#c4300f] via-[#ee4d2d] to-[#ff7a59]",
  },
  {
    value: "COINS",
    name: "Coins.ph",
    group: "E-wallets",
    tile: { src: "/payments/coins.png", color: true },
    card: { src: "/payments/coins-icon.png", color: true },
    brand: "#1652f0",
    face: "from-[#0b2a6f] via-[#1652f0] to-[#4f8cff]",
  },
  {
    value: "VISA",
    name: "Visa",
    group: "Cards",
    tile: { src: "/payments/visa.svg" },
    card: { src: "/payments/visa.svg", named: true },
    brand: "#1A1F71",
    face: "from-[#141a5e] via-[#1a1f71] to-[#3b4cc0]",
    number: "•••• •••• •••• 4242",
  },
  {
    value: "MASTERCARD",
    name: "Mastercard",
    group: "Cards",
    tile: { src: "/payments/mastercard-color.svg", color: true },
    card: { src: "/payments/mastercard-color.svg", color: true, named: true },
    brand: "#EB001B",
    face: "from-[#111111] via-[#2a2a2a] to-[#4a4a4a]",
    number: "•••• •••• •••• 4444",
  },
  {
    value: "JCB",
    name: "JCB",
    group: "Cards",
    tile: { src: "/payments/jcb.svg" },
    card: { src: "/payments/jcb.svg", named: true },
    brand: "#0B4EA2",
    face: "from-[#0a3f86] via-[#0b4ea2] to-[#0a7f5a]",
    number: "•••• •••• •••• 0505",
  },
  {
    value: "AMEX",
    name: "American Express",
    group: "Cards",
    tile: { src: "/payments/americanexpress.svg" },
    card: { src: "/payments/americanexpress.svg", named: true },
    brand: "#2E77BC",
    face: "from-[#1f5f99] via-[#2e77bc] to-[#6aa8e0]",
    number: "•••• •••••• •0005",
  },
];

/** A brand logo: in its own colors, or drawn in one color as brands allow on colored backgrounds. */
export function PaymentLogo({ file, tint, className }: { file: LogoFile; tint: string; className: string }) {
  if (file.color) {
    // eslint-disable-next-line @next/next/no-img-element -- a small local logo, shown as is
    return <img src={file.src} alt="" className={`object-contain ${className}`} aria-hidden />;
  }
  const mask: CSSProperties = {
    backgroundColor: tint,
    maskImage: `url(${file.src})`,
    WebkitMaskImage: `url(${file.src})`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "contain",
    WebkitMaskSize: "contain",
  };
  return <span className={`block ${className}`} style={mask} aria-hidden />;
}

/** The ways a store takes, from its settings */
export type StorePayments = { acceptsCash: boolean; onlinePayments: OnlinePayment[] };

export function takes(store: StorePayments, choice: PayChoice) {
  return choice === "COD" ? store.acceptsCash : store.onlinePayments.includes(choice);
}
