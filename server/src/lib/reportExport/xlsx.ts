import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { formatStamp } from "../reportDates.js";
import { BRAND, TAGLINE, type CellKind, type ReportDocument, type ReportTable } from "./document.js";

const ASSETS = path.resolve(process.cwd(), "assets");
const argb = (c: string) => `FF${c.replace("#", "").toUpperCase()}`;
const fill = (c: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(c) } });
const FORMATS: Record<CellKind, string | undefined> = { text: undefined, int: "#,##0", peso: '"₱"#,##0.00', percent: "0.0%" };
const BODY = "Calibri";
const DISPLAY = "Poppins";

/** The report as a Feasto-styled Excel workbook: a printable Summary sheet, plus a sheet per full list. */
export async function renderXlsx(report: ReportDocument): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Feasto";
  book.title = `${report.kind} · ${report.title} · ${report.period}`;
  book.subject = report.number;
  book.created = report.generatedAt;
  const logo = book.addImage({ buffer: readFileSync(path.join(ASSETS, "feasto-logo.png")) as unknown as ExcelJS.Buffer, extension: "png" });

  // On the Summary sheet the tables share columns, so the narrow rank column is left out (the rows are already in order)
  const main = report.tables
    .filter((t) => !t.excelOnly)
    .map((t) => {
      const keep = t.columns.map((c, i) => (c.label === "#" ? -1 : i)).filter((i) => i >= 0);
      const pick = (row: (string | number)[]) => keep.map((i) => row[i]);
      return { ...t, columns: keep.map((i) => t.columns[i]), rows: t.rows.map(pick), total: t.total && pick(t.total) };
    });
  const width = Math.max(4, ...main.map((t) => t.columns.length));
  const sheet = book.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(BRAND.orange) } },
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } },
    headerFooter: footer(report),
  });
  sheet.columns = Array.from({ length: width }, (_, i) => ({ width: i === 0 ? 30 : i === 1 && width > 4 ? 30 : 16 }));

  // Orange band, logo, report number
  sheet.getRow(1).height = 7;
  for (let c = 1; c <= width; c++) sheet.getCell(1, c).fill = fill(BRAND.orange);
  sheet.getRow(2).height = 14;
  sheet.getRow(3).height = 30;
  sheet.addImage(logo, { tl: { col: 0, row: 2 }, ext: { width: 132, height: 39 } });
  right(sheet, 3, width, report.kind.toUpperCase(), { bold: true, color: BRAND.orange, size: 10, name: DISPLAY });
  right(sheet, 4, width, report.number, { bold: true, size: 10 });
  right(sheet, 5, width, `Generated ${formatStamp(report.generatedAt)}`, { color: BRAND.muted, size: 9 });
  sheet.getCell(5, 1).value = TAGLINE.toUpperCase();
  sheet.getCell(5, 1).font = { name: BODY, size: 8, bold: true, color: { argb: argb(BRAND.muted) } };
  dashed(sheet, 6, width);

  let r = 8;
  sheet.getCell(r, 1).value = report.title;
  sheet.getCell(r, 1).font = { name: DISPLAY, size: 18, bold: true, color: { argb: argb(BRAND.ink) } };
  sheet.getRow(r).height = 28;
  r++;
  sheet.getCell(r, 1).value = `${report.kind}  ·  ${report.period}  ·  ${report.days} ${report.days === 1 ? "day" : "days"}`;
  sheet.getCell(r, 1).font = { name: BODY, size: 11, color: { argb: argb(BRAND.muted) } };
  r += 2;

  for (const [label, value] of report.details) {
    sheet.getCell(r, 1).value = label;
    sheet.getCell(r, 1).font = { name: BODY, size: 9, bold: true, color: { argb: argb(BRAND.muted) } };
    sheet.getCell(r, 2).value = value;
    sheet.getCell(r, 2).font = { name: BODY, size: 10, color: { argb: argb(BRAND.ink) } };
    r++;
  }
  r++;

  // Summary tiles: label, big value, note, one tile per column
  report.summary.forEach((tile, i) => {
    const col = i + 1;
    const edge = { style: "thin" as const, color: { argb: argb(BRAND.orangeLine) } };
    [r, r + 1, r + 2].forEach((row) => {
      const cell = sheet.getCell(row, col);
      cell.fill = fill(BRAND.orangeSoft);
      cell.border = { top: row === r ? edge : undefined, bottom: row === r + 2 ? edge : undefined, left: edge, right: edge };
      cell.alignment = { vertical: "middle", indent: 1 };
    });
    sheet.getCell(r, col).value = tile.label.toUpperCase();
    sheet.getCell(r, col).font = { name: BODY, size: 8, bold: true, color: { argb: argb(BRAND.orangeDark) } };
    const value = sheet.getCell(r + 1, col);
    value.value = tile.value;
    value.numFmt = FORMATS[tile.kind] ?? "";
    value.font = { name: BODY, size: 15, bold: true, color: { argb: argb(BRAND.ink) } };
    value.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    sheet.getCell(r + 2, col).value = tile.note ?? "";
    sheet.getCell(r + 2, col).font = { name: BODY, size: 8, color: { argb: argb(BRAND.muted) } };
  });
  sheet.getRow(r + 1).height = 26;
  r += 5;

  for (const table of main) r = writeTable(sheet, table, r) + 2;

  sheet.getCell(r, 1).value = "NOTES";
  sheet.getCell(r, 1).font = { name: BODY, size: 8, bold: true, color: { argb: argb(BRAND.muted) } };
  r++;
  for (const note of report.notes) {
    sheet.getCell(r, 1).value = `•  ${note}`;
    sheet.getCell(r, 1).font = { name: BODY, size: 9, color: { argb: argb(BRAND.muted) } };
    r++;
  }
  r++;
  dashed(sheet, r, width);
  sheet.mergeCells(r + 1, 1, r + 1, width);
  sheet.getCell(r + 1, 1).value = "END OF REPORT";
  sheet.getCell(r + 1, 1).alignment = { horizontal: "center" };
  sheet.getCell(r + 1, 1).font = { name: BODY, size: 8, bold: true, color: { argb: argb(BRAND.muted) } };
  dashed(sheet, r + 2, width);

  // One sheet per full list, ready to sort and filter
  for (const table of report.tables.filter((t) => t.excelOnly)) {
    const list = book.addWorksheet(table.title.slice(0, 31), {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { paperSize: 9, orientation: table.columns.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      headerFooter: footer(report),
    });
    list.columns = table.columns.map((c) => ({ width: Math.round((c.width ?? 1) * 14) }));
    list.getRow(1).height = 7;
    for (let c = 1; c <= table.columns.length; c++) list.getCell(1, c).fill = fill(BRAND.orange);
    list.getCell(2, 1).value = `${report.title} · ${table.title}`;
    list.getCell(2, 1).font = { name: DISPLAY, size: 13, bold: true, color: { argb: argb(BRAND.ink) } };
    list.getCell(3, 1).value = `${report.period} · ${report.number}`;
    list.getCell(3, 1).font = { name: BODY, size: 9, color: { argb: argb(BRAND.muted) } };
    const end = writeTable(list, { ...table, title: "" }, 4, true);
    if (table.rows.length) list.autoFilter = { from: { row: 4, column: 1 }, to: { row: end, column: table.columns.length } };
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}

function footer(report: ReportDocument): Partial<ExcelJS.HeaderFooter> {
  return {
    oddFooter: `&L&"${BODY},Bold"&K${BRAND.orange.slice(1)}Feasto&"${BODY},Regular"&K${BRAND.muted.slice(1)} · ${TAGLINE} · Naval, Biliran&C${report.number}&RPage &P of &N`,
  };
}

function right(sheet: ExcelJS.Worksheet, row: number, width: number, text: string, o: { bold?: boolean; color?: string; size?: number; name?: string }) {
  const cell = sheet.getCell(row, width);
  cell.value = text;
  cell.alignment = { horizontal: "right" };
  cell.font = { name: o.name ?? BODY, size: o.size ?? 10, bold: o.bold, color: { argb: argb(o.color ?? BRAND.ink) } };
}

function dashed(sheet: ExcelJS.Worksheet, row: number, width: number) {
  for (let c = 1; c <= width; c++) sheet.getCell(row, c).border = { bottom: { style: "dashed", color: { argb: "FFC7CCD4" } } };
  sheet.getRow(row).height = 8;
}

/** A section title, a dark header row, striped rows and a bold total. Returns the last row used. */
function writeTable(sheet: ExcelJS.Worksheet, table: ReportTable, start: number, plain = false) {
  let r = start;
  if (table.title) {
    const title = sheet.getCell(r, 1);
    title.value = table.title;
    title.font = { name: DISPLAY, size: 12, bold: true, color: { argb: argb(BRAND.ink) } };
    title.border = { left: { style: "thick", color: { argb: argb(BRAND.orange) } } };
    sheet.getRow(r).height = 22;
    r++;
    if (table.note) {
      sheet.getCell(r, 1).value = table.note;
      sheet.getCell(r, 1).font = { name: BODY, size: 9, color: { argb: argb(BRAND.muted) } };
      r++;
    }
  }
  table.columns.forEach((c, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = c.label;
    cell.fill = fill(BRAND.ink);
    cell.font = { name: BODY, size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: c.kind === "text" ? "left" : "right", vertical: "middle", indent: 1 };
  });
  sheet.getRow(r).height = 20;
  r++;
  if (table.rows.length === 0) {
    sheet.getCell(r, 1).value = "Nothing in this period.";
    sheet.getCell(r, 1).font = { name: BODY, size: 9, italic: true, color: { argb: argb(BRAND.muted) } };
    return r;
  }
  const put = (values: (string | number)[], bold: boolean, shade: boolean) => {
    table.columns.forEach((c, i) => {
      const cell = sheet.getCell(r, i + 1);
      const v = values[i] ?? "";
      cell.value = c.kind === "percent" && typeof v === "number" ? v / 100 : v;
      if (typeof v === "number" && FORMATS[c.kind]) cell.numFmt = FORMATS[c.kind]!;
      cell.font = { name: BODY, size: 10, bold, color: { argb: argb(BRAND.ink) } };
      cell.alignment = { horizontal: c.kind === "text" ? "left" : "right", vertical: "middle", indent: 1, wrapText: plain && c.kind === "text" && (c.width ?? 1) >= 3 };
      cell.border = bold ? { top: { style: "medium", color: { argb: argb(BRAND.ink) } } } : { bottom: { style: "hair", color: { argb: argb(BRAND.line) } } };
      if (shade) cell.fill = fill(BRAND.canvas);
    });
    r++;
  };
  table.rows.forEach((row, n) => put(row, false, n % 2 === 1));
  if (table.total) put(table.total, true, false);
  return r - 1;
}
