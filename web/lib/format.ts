/** "08:00" -> "8:00 AM" */
export function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** 1234.5 or "1234.50" -> "₱1,234.50" */
export function formatPeso(value: number | string) {
  return peso.format(Number(value));
}

/** "Just now", "5 min ago", "3 h ago", or a date */
export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDate(iso);
}

/** "Oct 19, 2026" */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 19, 2026, 3:05 PM" */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Time of day in Manila, e.g. "7:00 PM" */
export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/** "Wed, Oct 21" in Manila */
export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
}

/** Today's date in Manila as "YYYY-MM-DD", plus `addDays`. */
export function manilaDate(addDays = 0) {
  return new Date(Date.now() + 8 * 3600_000 + addDays * 86400_000).toISOString().slice(0, 10);
}
