import { ExternalLink, FileText, FileX2 } from "lucide-react";

/**
 * A private document, opened through the API so only the people allowed to see it can.
 * Not next/image: the optimizer would keep its own copy, and this file must not be cached.
 */
export function DocumentPreview({ href, kind, label }: { href: string; kind: "image" | "pdf" | null; label: string }) {
  if (!kind) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
        <FileX2 className="size-4 shrink-0" aria-hidden />
        {label} not uploaded yet
      </p>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-line p-2 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- see the note above
        <img src={href} alt={label} className="h-16 w-24 shrink-0 rounded-lg bg-canvas object-cover" />
      ) : (
        <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
          <FileText className="size-6" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{label}</span>
      <span className="flex shrink-0 items-center gap-1 pr-2 text-sm font-semibold text-brand-700">
        Open
        <ExternalLink className="size-3.5" aria-hidden />
      </span>
    </a>
  );
}
