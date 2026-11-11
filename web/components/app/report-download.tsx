"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText, FileType2, LoaderCircle, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { plainError } from "@/lib/browser-api";

type Format = "pdf" | "docx" | "xlsx";

const FORMATS: { format: Format; label: string; note: string; Icon: LucideIcon; tint: string }[] = [
  { format: "pdf", label: "PDF", note: "Ready to print or share", Icon: FileText, tint: "bg-red-50 text-red-600 ring-red-100" },
  { format: "docx", label: "Word", note: "Edit it before you send it", Icon: FileType2, tint: "bg-sky-50 text-sky-600 ring-sky-100" },
  { format: "xlsx", label: "Excel", note: "Every order and dish, to sort and add up", Icon: FileSpreadsheet, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
];

/**
 * "Download" with a menu of PDF, Word and Excel. Each file is the same report in the Feasto format.
 * `path` is the API path of the export (without the format), e.g. "/vendor/reports/export?from=…&to=…".
 */
/** `wide` fills its box (under the report preview), with the menu opening below it */
export function ReportDownload({ path, disabled, wide, secondary }: { path: string; disabled?: boolean; wide?: boolean; secondary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function download(format: Format, label: string) {
    setOpen(false);
    setBusy(format);
    try {
      const response = await fetch(`/api${path}${path.includes("?") ? "&" : "?"}format=${format}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const field = payload?.fieldErrors && (Object.values(payload.fieldErrors).flat()[0] as string | undefined);
        toast.error(`Couldn't make the ${label} file`, field ?? (typeof payload?.error === "string" ? payload.error : plainError(response.status)));
        return;
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `Feasto-Sales-Report.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`${label} downloaded`, name);
    } catch {
      toast.error(`Couldn't make the ${label} file`, plainError(0));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={box} className={`relative ${wide ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-11 items-center gap-2 rounded-xl ${wide ? "w-full justify-center" : ""} px-4 text-[15px] font-semibold transition ${secondary ? "border border-line bg-white text-ink hover:bg-canvas" : "bg-brand-600 text-white hover:bg-brand-700"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Download className="size-5" aria-hidden />}
        {busy ? `Making ${FORMATS.find((f) => f.format === busy)!.label}…` : "Download"}
        {!busy && <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Download as"
          className={`absolute right-0 z-30 mt-2 origin-top-right ${wide ? "left-0" : "w-72"} rounded-2xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(31,45,61,0.35)] motion-safe:animate-[sheet-up_0.18s_ease-out] max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:right-3 max-sm:bottom-[calc(var(--tabbar-h)+0.75rem+env(safe-area-inset-bottom))] max-sm:w-auto`}
        >
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Feasto report as</p>
          {FORMATS.map(({ format, label, note, Icon, tint }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => download(format, label)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${tint}`}>
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">
                  {label} <span className="font-normal text-muted">.{format}</span>
                </span>
                <span className="block text-xs text-muted">{note}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
