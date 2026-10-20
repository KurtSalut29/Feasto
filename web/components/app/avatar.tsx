import { initials } from "@/lib/format";

// Soft colors; each person keeps the same one everywhere because it comes from their name
const COLORS = [
  "bg-brand-50 text-brand-700",
  "bg-sky-50 text-sky-700",
  "bg-emerald-50 text-emerald-700",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-800",
  "bg-rose-50 text-rose-700",
  "bg-teal-50 text-teal-700",
];

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

const SIZES = { sm: "size-8 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" };

/** A person's initials in a colored circle. */
export function Avatar({ name, size = "md", muted }: { name: string; size?: keyof typeof SIZES; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-black/5 ${SIZES[size]} ${muted ? "bg-gray-100 text-gray-400" : colorFor(name)}`}
    >
      {initials(name)}
    </span>
  );
}
