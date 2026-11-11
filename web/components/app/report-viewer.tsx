"use client";

import { FileText, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ReportDownload } from "@/components/app/report-download";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type CellKind = "text" | "int" | "peso" | "percent";
type Cell = string | number;
type ReportTable = {
  title: string;
  note?: string;
  columns: { label: string; kind: CellKind; width?: number }[];
  rows: Cell[][];
  total?: Cell[];
  chart?: { label: string; value: number }[];
  chartKind?: "columns" | "bars";
};
/** The report as the server builds it for every file (server/src/lib/reportExport/document.ts) */
export type ReportDocument = {
  number: string;
  title: string;
  kind: string;
  period: string;
  days: number;
  details: [string, string][];
  summary: { label: string; value: Cell; kind: CellKind; note?: string }[];
  tables: ReportTable[];
  notes: string[];
  generatedAt: string;
};

const cellText = (value: Cell, kind: CellKind) =>
  typeof value === "string"
    ? value
    : kind === "peso"
      ? formatPeso(value)
      : kind === "percent"
        ? `${value.toFixed(1)}%`
        : value.toLocaleString("en-PH");

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * "View report": opens the Feasto report full size, exactly the parts of the PDF, with the downloads on top.
 * Pass children to make them the button (e.g. the small picture of the report).
 */
export function ViewReportButton({ documentPath, exportPath, children, label = "View report" }: { documentPath: string; exportPath: string; children?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {children ? (
        <button type="button" onClick={() => setOpen(true)} aria-label={label} className="group/paper block w-full cursor-zoom-in rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500">
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <FileText className="size-5" aria-hidden />
          {label}
        </button>
      )}
      {open && <ReportViewer documentPath={documentPath} exportPath={exportPath} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportViewer({ documentPath, exportPath, onClose }: { documentPath: string; exportPath: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<ReportDocument>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    apiRequest<{ document: ReportDocument }>(documentPath).then((result) => {
      if (!live) return;
      if (result.ok) setDoc(result.data.document);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [documentPath]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label="Feasto report"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-[#e9ecf0] p-0 text-ink backdrop:bg-ink/60 motion-safe:animate-[fade-in_0.2s_ease-out]"
    >
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-3 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{doc ? doc.title : "Feasto report"}</p>
            <p className="truncate text-xs text-muted">{doc ? `${doc.period} · ${doc.number}` : "Getting the report ready…"}</p>
          </div>
          <ReportDownload path={exportPath} disabled={!doc} />
        </div>

        {/* The paper */}
        <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
          {error ? (
            <div role="alert" className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center">
              <p className="font-semibold text-ink">Couldn&apos;t show the report</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
            </div>
          ) : !doc ? (
            <div className="flex items-center justify-center gap-3 py-24 text-muted">
              <LoaderCircle className="size-6 animate-spin text-brand-600" aria-hidden /> Getting the report ready…
            </div>
          ) : (
            <ReportSheet doc={doc} />
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The Feasto report format on screen: the same parts, order and look as the PDF */
export function ReportSheet({ doc }: { doc: ReportDocument }) {
  return (
    <article aria-label={`${doc.kind}: ${doc.title}, ${doc.period}`} className="mx-auto max-w-[820px] overflow-hidden rounded-sm bg-white shadow-[0_20px_50px_-20px_rgba(31,45,61,0.45)] motion-safe:animate-[rise-in_0.35s_ease-out]">
      <div aria-hidden className="h-2 bg-brand-500" />
      <div aria-hidden className="h-0.5 bg-brand-700" />
      <div className="px-5 pt-6 pb-8 sm:px-12 sm:pt-9">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Image src="/Logo/feasto-logo.png" alt="Feasto" width={130} height={38} className="h-[38px] w-[130px] object-contain" />
            <p className="mt-1 text-[9px] font-bold tracking-[0.28em] text-muted uppercase">Order · Book · Enjoy</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold tracking-[0.25em] text-brand-600 uppercase">{doc.kind}</p>
            <p className="mt-0.5 text-sm font-bold text-ink">{doc.number}</p>
            <p className="text-xs text-muted">Generated {stamp(doc.generatedAt)}</p>
          </div>
        </header>
        <div aria-hidden className="my-5 border-t-2 border-dashed border-gray-300" />

        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{doc.title}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {doc.kind} · {doc.period} · {doc.days} {doc.days === 1 ? "day" : "days"}
        </p>

        <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {doc.details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase">{label}</dt>
              <dd className="text-sm text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {doc.summary.map((tile) => (
            <div key={tile.label} className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3">
              <p className="text-[10px] font-bold tracking-[0.12em] text-brand-700 uppercase">{tile.label}</p>
              <p className="mt-1 truncate text-lg font-bold text-ink tabular-nums sm:text-xl">{cellText(tile.value, tile.kind)}</p>
              {tile.note && <p className="truncate text-[11px] text-muted">{tile.note}</p>}
            </div>
          ))}
        </div>

        {doc.tables.map((table) => (
          <section key={table.title} className="mt-8">
            <h3 className="flex items-center gap-2.5 text-base font-semibold text-ink">
              <span aria-hidden className="h-4 w-1 rounded-full bg-brand-500" />
              {table.title}
            </h3>
            {table.note && <p className="mt-0.5 pl-3.5 text-xs text-muted">{table.note}</p>}
            {table.chart && table.chart.some((c) => c.value > 0) && <Chart data={table.chart} kind={table.chartKind ?? "columns"} />}
            <SheetTable table={table} />
          </section>
        ))}

        <div className="mt-8">
          <p className="text-[10px] font-bold tracking-[0.14em] text-muted uppercase">Notes</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {doc.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
        <p aria-hidden className="mt-6 border-y-2 border-dashed border-gray-300 py-1.5 text-center text-[10px] font-bold tracking-[0.4em] text-muted">
          END OF REPORT
        </p>
        <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[11px] text-muted">
          <span>
            <span className="font-bold text-brand-600">Feasto</span> · Order · Book · Enjoy · Naval, Biliran
          </span>
          <span>{doc.number}</span>
        </footer>
      </div>
    </article>
  );
}

function Chart({ data, kind }: { data: { label: string; value: number }[]; kind: "columns" | "bars" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (kind === "bars") {
    return (
      <ul aria-hidden className="mt-3 space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate text-ink">{d.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-canvas">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
            </span>
            <span className="font-semibold text-ink tabular-nums">{formatPeso(d.value)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const every = Math.ceil(data.length / 12);
  return (
    <div aria-hidden className="mt-3">
      <div className="flex h-28 items-end gap-[2px] border-b border-gray-300">
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 items-end justify-center">
            <div className="w-full max-w-5 rounded-t-[3px] bg-brand-500" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[9px] text-muted">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center whitespace-nowrap">
            {i % every === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function SheetTable({ table }: { table: ReportTable }) {
  const align = (kind: CellKind) => (kind === "text" ? "text-left" : "text-right");
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th
                key={c.label + i}
                scope="col"
                style={{ width: `${((c.width ?? 1) / table.columns.reduce((n, col) => n + (col.width ?? 1), 0)) * 100}%` }}
                className={`bg-ink px-3 py-2 text-[10px] font-bold tracking-[0.1em] text-white uppercase first:rounded-l-md last:rounded-r-md ${align(c.kind)}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={table.columns.length} className="px-3 py-3 text-muted">
                Nothing in this period.
              </td>
            </tr>
          ) : (
            table.rows.map((row, r) => (
              <tr key={r} className="even:bg-canvas">
                {table.columns.map((c, i) => (
                  <td key={i} className={`px-3 py-1.5 text-ink tabular-nums ${align(c.kind)}`}>
                    {cellText(row[i] ?? "", c.kind)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {table.total && (
          <tfoot>
            <tr>
              {table.columns.map((c, i) => (
                <td key={i} className={`border-t-2 border-ink px-3 py-2 font-bold text-ink tabular-nums ${align(c.kind)}`}>
                  {cellText(table.total![i] ?? "", c.kind)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
