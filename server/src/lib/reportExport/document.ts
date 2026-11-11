import { dayCount, formatDay, formatMonth, formatRange, formatStamp } from "../reportDates.js";
import type { ReportPart } from "../reports.js";
import { hourLabel, type StoreReport } from "../storeReport.js";

/**
 * The Feasto report format. Every download (PDF, Word, Excel) is drawn from this one shape,
 * so the three files always have the same parts in the same order:
 *   orange band · logo and "SALES REPORT" with the report number · title and period ·
 *   who it's for · summary tiles · tables · footer with the tagline and page numbers.
 */
export type CellKind = "text" | "int" | "peso" | "percent";
export type Column = { label: string; kind: CellKind; /** relative width */ width?: number };
export type Cell = string | number;

export type ReportTable = {
  title: string;
  note?: string;
  columns: Column[];
  rows: Cell[][];
  /** Bold last line, e.g. totals */
  total?: Cell[];
  /** Bars drawn above the table in the PDF (label, value): columns for dates, bars for names */
  chart?: { label: string; value: number }[];
  chartKind?: "columns" | "bars";
  /** Only in the Excel file (e.g. the full order list) */
  excelOnly?: boolean;
};

export type ReportDocument = {
  number: string;
  /** "Aling Nena's Carinderia" or "All Feasto stores" */
  title: string;
  /** "Sales report" */
  kind: string;
  from: string;
  to: string;
  period: string;
  days: number;
  details: [string, string][];
  summary: { label: string; value: Cell; kind: CellKind; note?: string }[];
  tables: ReportTable[];
  notes: string[];
  generatedAt: Date;
  /** File name without the extension */
  fileName: string;
};

export const BRAND = {
  orange: "#FE5502",
  orangeDark: "#B23A00",
  orangeSoft: "#FFF5EE",
  orangeLine: "#FFCBAB",
  ink: "#1F2D3D",
  muted: "#5B6472",
  line: "#E4E7EC",
  canvas: "#F7F8FA",
};
export const TAGLINE = "Order · Book · Enjoy";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
/** How a cell reads in the PDF and Word files (Excel keeps real numbers) */
export function cellText(value: Cell, kind: CellKind) {
  if (typeof value === "string") return value;
  if (kind === "peso") return peso.format(value);
  if (kind === "percent") return `${value.toFixed(1)}%`;
  if (kind === "int") return value.toLocaleString("en-PH");
  return String(value);
}

const compactDate = (d: string) => d.slice(2).replaceAll("-", "");
/** FR-S-261001-261011-A1B2: Feasto Report · S(tore) or P(latform) · period · whose */
export const reportNumber = (scope: "S" | "P", from: string, to: string, key: string) =>
  `FR-${scope}-${compactDate(from)}-${compactDate(to)}-${key.slice(-4).toUpperCase()}`;

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const share = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

/** Days for up to two months; whole months after that, so a year-long table stays short */
function byDayOrMonth(daily: StoreReport["daily"]) {
  if (daily.length <= 62) return { unit: "Day", rows: daily.map((d) => ({ label: formatDay(d.date), short: d.date.slice(8), ...d })) };
  const months = new Map<string, { orders: number; sales: number }>();
  for (const d of daily) {
    const m = months.get(d.date.slice(0, 7)) ?? { orders: 0, sales: 0 };
    m.orders += d.orders;
    m.sales += d.sales;
    months.set(d.date.slice(0, 7), m);
  }
  return { unit: "Month", rows: [...months].map(([ym, m]) => ({ label: formatMonth(ym), short: formatMonth(ym).slice(0, 3), date: ym, ...m })) };
}

export function storeDocument(report: StoreReport, preparedFor: string): ReportDocument {
  const { totals } = report;
  const period = byDayOrMonth(report.daily);
  const number = reportNumber("S", report.from, report.to, report.store.id);
  return {
    number,
    title: report.store.name,
    kind: "Sales report",
    from: report.from,
    to: report.to,
    period: formatRange(report.from, report.to),
    days: report.days,
    details: [
      ["Store", report.store.name],
      ["Address", report.store.address],
      ["Prepared for", preparedFor],
      ["Period", `${formatRange(report.from, report.to)} (${report.days} ${report.days === 1 ? "day" : "days"})`],
    ],
    summary: [
      { label: "Sales", value: totals.sales, kind: "peso", note: "Before delivery fees" },
      { label: "Orders", value: totals.orders, kind: "int", note: `${totals.itemsSold.toLocaleString("en-PH")} items sold` },
      { label: "Average order", value: totals.averageOrder, kind: "peso", note: "Sales ÷ orders" },
      {
        label: "Not completed",
        value: totals.cancelled + totals.declined,
        kind: "int",
        note: `${totals.declined} declined · ${totals.cancelled} cancelled`,
      },
    ],
    tables: [
      {
        title: `Sales by ${period.unit.toLowerCase()}`,
        note: totals.busiestHour !== null ? `Busiest hour: ${hourLabel(totals.busiestHour)}` : undefined,
        columns: [
          { label: period.unit, kind: "text", width: 2 },
          { label: "Orders", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.4 },
          { label: "Share", kind: "percent" },
        ],
        rows: period.rows.map((r) => [r.label, r.orders, r.sales, share(r.sales, totals.sales)]),
        total: ["Total", totals.orders, totals.sales, totals.sales ? 100 : 0],
        chart: period.rows.map((r) => ({ label: r.short, value: r.sales })),
      },
      {
        title: "Best sellers",
        note: report.dishes.length > 15 ? `Top 15 of ${report.dishes.length} dishes. The Excel file lists them all.` : undefined,
        columns: [
          { label: "#", kind: "int", width: 0.4 },
          { label: "Dish", kind: "text", width: 2.6 },
          { label: "Sold", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.4 },
        ],
        rows: report.dishes.slice(0, 15).map((d, i) => [i + 1, d.name, d.quantity, d.sales]),
      },
      {
        title: "How residents paid",
        columns: [
          { label: "Payment", kind: "text", width: 2 },
          { label: "Orders", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.4 },
          { label: "Share", kind: "percent" },
        ],
        rows: report.payments.map((p) => [p.method, p.orders, p.sales, share(p.sales, totals.sales)]),
      },
      {
        title: "Delivery and pickup",
        columns: [
          { label: "Type", kind: "text", width: 2 },
          { label: "Orders", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.4 },
          { label: "Share", kind: "percent" },
        ],
        rows: report.fulfillment.map((f) => [f.type, f.orders, f.sales, share(f.sales, totals.sales)]),
      },
      {
        title: "All dishes",
        excelOnly: true,
        columns: [
          { label: "#", kind: "int", width: 0.4 },
          { label: "Dish", kind: "text", width: 3 },
          { label: "Sold", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.4 },
        ],
        rows: report.dishes.map((d, i) => [i + 1, d.name, d.quantity, d.sales]),
      },
      {
        title: "Orders",
        excelOnly: true,
        columns: [
          { label: "Order", kind: "text" },
          { label: "Placed", kind: "text", width: 1.6 },
          { label: "Customer", kind: "text", width: 1.6 },
          { label: "Type", kind: "text" },
          { label: "Payment", kind: "text" },
          { label: "Status", kind: "text", width: 1.4 },
          { label: "Items", kind: "text", width: 4 },
          { label: "Subtotal", kind: "peso", width: 1.2 },
          { label: "Delivery fee", kind: "peso", width: 1.2 },
        ],
        rows: report.orders.map((o) => [o.code, formatStamp(new Date(o.placedAt)), o.customer, o.type, o.payment, o.status, o.items, o.subtotal, o.deliveryFee]),
      },
    ],
    notes: [
      "Sales count every order that wasn't cancelled or declined, before delivery fees. Delivery fees go to the riders.",
      "Dates and times are Philippine time. Amounts are in Philippine pesos (₱).",
      "Online payments in Feasto are simulated for this project; no real money moved.",
    ],
    generatedAt: new Date(),
    fileName: `Feasto-Sales-Report_${slug(report.store.name)}_${report.from}_to_${report.to}`,
  };
}

/** The admin's report of every store (computed by the workers) */
export function platformDocument(
  report: { id: string; from: string; to: string; rows: ReportPart[]; totals: { orders: number; sales: number; deliveryFees: number; cancelled: number }; workers: string[]; durationMs: number | null },
  preparedFor: string,
): ReportDocument {
  const { totals } = report;
  const rows = [...report.rows].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  const days = dayCount(report.from, report.to);
  const selling = rows.filter((r) => r.orders > 0).length;
  return {
    number: reportNumber("P", report.from, report.to, report.id.replaceAll("-", "")),
    title: "All Feasto stores",
    kind: "Sales report",
    from: report.from,
    to: report.to,
    period: formatRange(report.from, report.to),
    days,
    details: [
      ["Scope", `${rows.length} approved stores · ${selling} sold something`],
      ["Prepared for", preparedFor],
      ["Period", `${formatRange(report.from, report.to)} (${days} ${days === 1 ? "day" : "days"})`],
      ["Computed by", `${report.workers.length} workers in ${((report.durationMs ?? 0) / 1000).toFixed(2)} s`],
    ],
    summary: [
      { label: "Sales", value: totals.sales, kind: "peso", note: "Before delivery fees" },
      { label: "Orders", value: totals.orders, kind: "int", note: `${totals.cancelled} cancelled or declined` },
      { label: "Average order", value: totals.orders ? totals.sales / totals.orders : 0, kind: "peso", note: "Sales ÷ orders" },
      { label: "Delivery fees", value: totals.deliveryFees, kind: "peso", note: "Earned by riders" },
    ],
    tables: [
      {
        title: "Sales by store",
        note:
          selling < rows.length
            ? `Highest sales first. ${rows.length - selling} stores with no orders in this period are left out here; the Excel file lists every store.`
            : "Highest sales first.",
        columns: [
          { label: "#", kind: "int", width: 0.4 },
          { label: "Store", kind: "text", width: 2.4 },
          { label: "Orders", kind: "int", width: 0.8 },
          { label: "Sales", kind: "peso", width: 1.3 },
          { label: "Share", kind: "percent", width: 0.8 },
          { label: "Best seller", kind: "text", width: 1.8 },
        ],
        rows: rows.filter((r) => r.orders > 0).map((r, i) => [i + 1, r.name, r.orders, r.sales, share(r.sales, totals.sales), r.topDish ?? "—"]),
        total: ["", "Total", totals.orders, totals.sales, totals.sales ? 100 : 0, ""],
        chart: rows.filter((r) => r.sales > 0).slice(0, 10).map((r) => ({ label: r.name, value: r.sales })),
        chartKind: "bars",
      },
      {
        title: "Store details",
        excelOnly: true,
        columns: [
          { label: "Store", kind: "text", width: 2.4 },
          { label: "Orders", kind: "int" },
          { label: "Sales", kind: "peso", width: 1.3 },
          { label: "Delivery fees", kind: "peso", width: 1.3 },
          { label: "Cancelled or declined", kind: "int", width: 1.4 },
          { label: "Best seller", kind: "text", width: 1.8 },
          { label: "Computed by", kind: "text", width: 1.4 },
        ],
        rows: rows.map((r) => [r.name, r.orders, r.sales, r.deliveryFees, r.cancelled, r.topDish ?? "—", r.computedBy]),
      },
    ],
    notes: [
      "Sales count every order that wasn't cancelled or declined, before delivery fees. Delivery fees go to the riders.",
      "Each store's numbers were computed as a separate job, shared across Feasto's workers.",
      "Dates and times are Philippine time. Amounts are in Philippine pesos (₱).",
    ],
    generatedAt: new Date(),
    fileName: `Feasto-Sales-Report_All-stores_${report.from}_to_${report.to}`,
  };
}
