import path from "node:path";
import PDFDocument from "pdfkit";
import { formatStamp } from "../reportDates.js";
import { BRAND, cellText, TAGLINE, type ReportDocument, type ReportTable } from "./document.js";

const ASSETS = path.resolve(process.cwd(), "assets");
const FONT = {
  display: path.join(ASSETS, "fonts", "Poppins-Bold.ttf"),
  displaySemi: path.join(ASSETS, "fonts", "Poppins-SemiBold.ttf"),
  body: path.join(ASSETS, "fonts", "NotoSans-Regular.ttf"),
  bodyBold: path.join(ASSETS, "fonts", "NotoSans-Bold.ttf"),
};
const LOGO = path.join(ASSETS, "feasto-logo.png");

// A4 in points, with Feasto's margins
const W = 595.28;
const H = 841.89;
const M = 44;
const CONTENT = W - M * 2;
const BOTTOM = H - 64; // leaves room for the footer

/** The report as a Feasto-styled A4 PDF. */
export function renderPdf(report: ReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: 0, left: M, right: M },
    bufferPages: true,
    info: { Title: `${report.kind} · ${report.title} · ${report.period}`, Author: "Feasto", Subject: report.number, Creator: "Feasto" },
  });
  for (const [name, file] of Object.entries(FONT)) doc.registerFont(name, file);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  let y = firstPageHeader(doc, report);

  const ensure = (needed: number) => {
    if (y + needed <= BOTTOM) return false;
    doc.addPage();
    y = laterPageHeader(doc, report);
    return true;
  };

  // Summary tiles
  const gap = 10;
  const tileW = (CONTENT - gap * (report.summary.length - 1)) / report.summary.length;
  report.summary.forEach((tile, i) => {
    const x = M + i * (tileW + gap);
    doc.roundedRect(x, y, tileW, 66, 10).fillAndStroke(BRAND.orangeSoft, BRAND.orangeLine);
    doc.font("bodyBold").fontSize(7.5).fillColor(BRAND.orangeDark).text(tile.label.toUpperCase(), x + 12, y + 10, { width: tileW - 24, characterSpacing: 0.8 });
    doc.font("bodyBold").fontSize(15).fillColor(BRAND.ink).text(cellText(tile.value, tile.kind), x + 12, y + 23, { width: tileW - 24, lineBreak: false, ellipsis: true });
    if (tile.note) doc.font("body").fontSize(7.5).fillColor(BRAND.muted).text(tile.note, x + 12, y + 46, { width: tileW - 24, lineBreak: false, ellipsis: true });
  });
  y += 66 + 24;

  for (const table of report.tables.filter((t) => !t.excelOnly)) {
    ensure(90);
    y = sectionTitle(doc, table, y);
    if (table.chart && table.chart.some((c) => c.value > 0)) {
      const h = table.chartKind === "bars" ? table.chart.length * 18 + 6 : 120;
      ensure(h + 10);
      y = table.chartKind === "bars" ? bars(doc, table.chart, y) : columns(doc, table.chart, y);
      y += 12;
    }
    y = drawTable(doc, table, y, ensure, () => y);
    y += 22;
  }

  // Notes and the end mark, like the bottom of a Feasto receipt
  ensure(40 + report.notes.length * 14);
  doc.font("bodyBold").fontSize(8).fillColor(BRAND.muted).text("NOTES", M, y, { characterSpacing: 1 });
  y += 14;
  for (const note of report.notes) {
    doc.font("body").fontSize(8.5).fillColor(BRAND.muted).text(`•  ${note}`, M, y, { width: CONTENT });
    y = doc.y + 3;
  }
  y += 10;
  ensure(30);
  endMark(doc, y);

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = H - 40;
    doc.moveTo(M, fy - 8).lineTo(W - M, fy - 8).lineWidth(0.6).strokeColor(BRAND.line).stroke();
    doc.font("bodyBold").fontSize(7.5).fillColor(BRAND.orange).text("Feasto", M, fy, { continued: true, lineBreak: false });
    doc.font("body").fillColor(BRAND.muted).text(`  ·  ${TAGLINE}  ·  Naval, Biliran`, { lineBreak: false });
    doc.font("body").fontSize(7.5).fillColor(BRAND.muted).text(report.number, M, fy, { width: CONTENT, align: "center", lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M, fy, { width: CONTENT, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

function band(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, W, 8).fill(BRAND.orange);
  doc.rect(0, 8, W, 2).fill(BRAND.orangeDark);
}

function dashedRule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).dash(3, { space: 3 }).strokeColor("#C7CCD4").stroke().undash();
}

function firstPageHeader(doc: PDFKit.PDFDocument, report: ReportDocument) {
  band(doc);
  doc.image(LOGO, M, 32, { width: 118 });
  doc.font("bodyBold").fontSize(6.5).fillColor(BRAND.muted).text(TAGLINE.toUpperCase(), M + 2, 72, { characterSpacing: 2.2 });

  doc.font("displaySemi").fontSize(9).fillColor(BRAND.orange).text(report.kind.toUpperCase(), M, 34, { width: CONTENT, align: "right", characterSpacing: 2.5 });
  doc.font("bodyBold").fontSize(10).fillColor(BRAND.ink).text(report.number, M, 48, { width: CONTENT, align: "right" });
  doc.font("body").fontSize(8).fillColor(BRAND.muted).text(`Generated ${formatStamp(report.generatedAt)}`, M, 63, { width: CONTENT, align: "right" });

  dashedRule(doc, 92);
  doc.font("display").fontSize(22).fillColor(BRAND.ink).text(report.title, M, 106, { width: CONTENT });
  let y = doc.y + 1;
  doc.font("body").fontSize(10.5).fillColor(BRAND.muted).text(`${report.kind}  ·  ${report.period}  ·  ${report.days} ${report.days === 1 ? "day" : "days"}`, M, y);
  y = doc.y + 14;

  // Details in two columns
  const colW = CONTENT / 2;
  report.details.forEach(([label, value], i) => {
    const x = M + (i % 2) * colW;
    const rowY = y + Math.floor(i / 2) * 34;
    doc.font("bodyBold").fontSize(7).fillColor(BRAND.muted).text(label.toUpperCase(), x, rowY, { characterSpacing: 1 });
    doc.font("body").fontSize(9.5).fillColor(BRAND.ink).text(value, x, rowY + 11, { width: colW - 16, lineBreak: false, ellipsis: true });
  });
  y += Math.ceil(report.details.length / 2) * 34 + 6;
  return y;
}

function laterPageHeader(doc: PDFKit.PDFDocument, report: ReportDocument) {
  band(doc);
  doc.image(LOGO, M, 26, { width: 74 });
  doc.font("body").fontSize(8).fillColor(BRAND.muted).text(`${report.title}  ·  ${report.period}`, M, 32, { width: CONTENT, align: "right" });
  dashedRule(doc, 56);
  return 72;
}

function sectionTitle(doc: PDFKit.PDFDocument, table: ReportTable, y: number) {
  doc.roundedRect(M, y + 2, 4, 13, 2).fill(BRAND.orange);
  doc.font("displaySemi").fontSize(12).fillColor(BRAND.ink).text(table.title, M + 12, y, { lineBreak: false });
  y += 20;
  if (table.note) {
    doc.font("body").fontSize(8.5).fillColor(BRAND.muted).text(table.note, M + 12, y - 3);
    y = doc.y + 6;
  }
  return y;
}

/** Column chart for days or months */
function columns(doc: PDFKit.PDFDocument, data: { label: string; value: number }[], y: number) {
  const h = 92;
  // A round top for the axis (₱500, ₱1K, ₱2.5K…), split by one gridline halfway
  const highest = Math.max(...data.map((d) => d.value), 1);
  const power = 10 ** Math.floor(Math.log10(highest / 2));
  const max = [1, 2, 2.5, 5, 10].map((m) => m * power * 2).find((top) => top >= highest)!;
  const plotX = M + 40;
  const slot = (CONTENT - 40) / data.length;
  const barW = Math.max(1.5, Math.min(22, slot - Math.max(1, slot * 0.25)));
  const every = Math.ceil(data.length / 16);
  // Two gridlines, each labelled with its amount
  for (const f of [0.5, 1]) {
    const gy = y + h - (h - 6) * f;
    doc.moveTo(M + 40, gy).lineTo(W - M, gy).lineWidth(0.4).strokeColor(BRAND.line).stroke();
    doc.font("body").fontSize(6.5).fillColor(BRAND.muted).text(compactPeso(max * f), M, gy - 4, { width: 36, align: "right", lineBreak: false });
  }
  data.forEach((d, i) => {
    const bh = (d.value / max) * (h - 6);
    const x = plotX + i * slot + (slot - barW) / 2;
    if (bh > 0) doc.roundedRect(x, y + h - bh, barW, bh, Math.min(3, barW / 2)).fill(BRAND.orange);
    if (i % every === 0) doc.font("body").fontSize(6.5).fillColor(BRAND.muted).text(d.label, plotX + i * slot - 10, y + h + 4, { width: slot + 20, align: "center", lineBreak: false });
  });
  doc.moveTo(plotX, y + h).lineTo(W - M, y + h).lineWidth(0.8).strokeColor("#C7CCD4").stroke();
  return y + h + 16;
}

/** Bar chart for names (stores) */
function bars(doc: PDFKit.PDFDocument, data: { label: string; value: number }[], y: number) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const labelW = 150;
  const valueW = 80;
  const trackW = CONTENT - labelW - valueW - 12;
  data.forEach((d, i) => {
    const rowY = y + i * 18;
    doc.font("body").fontSize(8.5).fillColor(BRAND.ink).text(d.label, M, rowY + 2, { width: labelW - 8, lineBreak: false, ellipsis: true });
    doc.roundedRect(M + labelW, rowY + 3, trackW, 9, 4.5).fill(BRAND.canvas);
    doc.roundedRect(M + labelW, rowY + 3, Math.max(4, (d.value / max) * trackW), 9, 4.5).fill(BRAND.orange);
    doc.font("bodyBold").fontSize(8.5).fillColor(BRAND.ink).text(cellText(d.value, "peso"), W - M - valueW, rowY + 2, { width: valueW, align: "right", lineBreak: false });
  });
  return y + data.length * 18;
}

function drawTable(doc: PDFKit.PDFDocument, table: ReportTable, startY: number, ensure: (n: number) => boolean, currentY: () => number) {
  const totalWeight = table.columns.reduce((n, c) => n + (c.width ?? 1), 0);
  const widths = table.columns.map((c) => ((c.width ?? 1) / totalWeight) * CONTENT);
  const rowH = 19;
  let y = startY;

  const header = () => {
    doc.roundedRect(M, y, CONTENT, rowH, 5).fill(BRAND.ink);
    let x = M;
    table.columns.forEach((c, i) => {
      doc.font("bodyBold").fontSize(7.5).fillColor("#FFFFFF").text(c.label.toUpperCase(), x + 8, y + 6, {
        width: widths[i] - 16,
        align: c.kind === "text" ? "left" : "right",
        lineBreak: false,
        characterSpacing: 0.6,
      });
      x += widths[i];
    });
    y += rowH;
  };

  const line = (cells: (string | number)[], bold: boolean, shade: boolean) => {
    if (shade) doc.rect(M, y, CONTENT, rowH).fill(BRAND.canvas);
    let x = M;
    table.columns.forEach((c, i) => {
      doc.font(bold ? "bodyBold" : "body").fontSize(8.5).fillColor(BRAND.ink).text(cellText(cells[i] ?? "", c.kind), x + 8, y + 5.5, {
        width: widths[i] - 16,
        align: c.kind === "text" ? "left" : "right",
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[i];
    });
    y += rowH;
  };

  if (ensure(rowH * 3)) y = currentY();
  header();
  if (table.rows.length === 0) {
    doc.font("body").fontSize(8.5).fillColor(BRAND.muted).text("Nothing in this period.", M + 8, y + 6);
    return y + rowH + 4;
  }
  table.rows.forEach((row, i) => {
    if (y + rowH > BOTTOM) {
      ensure(BOTTOM); // starts a new page
      y = currentY();
      header();
    }
    line(row, false, i % 2 === 1);
  });
  if (table.total) {
    if (y + rowH + 2 > BOTTOM) {
      ensure(BOTTOM);
      y = currentY();
      header();
    }
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1).strokeColor(BRAND.ink).stroke();
    line(table.total, true, false);
  }
  return y;
}

/** 23035 -> "₱23K", 1250 -> "₱1.3K" */
function compactPeso(value: number) {
  if (value >= 1000) return `₱${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₱${Math.round(value)}`;
}

function endMark(doc: PDFKit.PDFDocument, y: number) {
  dashedRule(doc, y);
  doc.font("bodyBold").fontSize(7.5).fillColor(BRAND.muted).text("END OF REPORT", M, y + 8, { width: CONTENT, align: "center", characterSpacing: 3 });
  dashedRule(doc, y + 24);
}
