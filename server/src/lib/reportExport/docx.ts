import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  CharacterSet,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
} from "docx";
import { formatStamp } from "../reportDates.js";
import { BRAND, cellText, TAGLINE, type Cell, type ReportDocument, type ReportTable } from "./document.js";

const ASSETS = path.resolve(process.cwd(), "assets");
const read = (file: string) => readFileSync(path.join(ASSETS, file));
const hex = (c: string) => c.replace("#", "");

/** Embedded as its own family so Word shows the heavy face (its Windows name is "Poppins SemiBold") */
const DISPLAY = "Poppins SemiBold";
const BODY = "Noto Sans";
// A4 with 2 cm margins: the text is 17 cm wide (in twentieths of a point)
const CONTENT_TWIPS = 9638;

const none: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

const run = (text: string, o: { size?: number; bold?: boolean; color?: string; font?: string; spacing?: number } = {}) =>
  new TextRun({ text, font: o.font ?? BODY, size: (o.size ?? 9.5) * 2, bold: o.bold, color: hex(o.color ?? BRAND.ink), characterSpacing: o.spacing });

/** The report as a Feasto-styled Word file. */
export async function renderDocx(report: ReportDocument): Promise<Buffer> {
  const logo = read("feasto-logo.png");

  const header = new Header({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.THICK, size: 36, color: hex(BRAND.orange), space: 6 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_TWIPS }],
        children: [
          new ImageRun({ type: "png", data: logo, transformation: { width: 112, height: 33 } }),
          new TextRun({ text: "\t" }),
          run(report.kind.toUpperCase(), { size: 8, color: BRAND.orange, font: DISPLAY, spacing: 40 }),
          run(`   ${report.number}`, { size: 8, color: BRAND.muted }),
        ],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(BRAND.line), space: 6 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_TWIPS }],
        children: [
          run("Feasto", { size: 7.5, bold: true, color: BRAND.orange }),
          run(`  ·  ${TAGLINE}  ·  Naval, Biliran`, { size: 7.5, color: BRAND.muted }),
          new TextRun({ text: "\t" }),
          new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: BODY, size: 15, color: hex(BRAND.muted) }),
        ],
      }),
    ],
  });

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 0 },
      children: [run(TAGLINE.toUpperCase(), { size: 7, bold: true, color: BRAND.muted, spacing: 40 })],
    }),
    new Paragraph({
      spacing: { before: 160, after: 40 },
      children: [run(report.title, { size: 22, font: DISPLAY })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [run(`${report.kind}  ·  ${report.period}  ·  ${report.days} ${report.days === 1 ? "day" : "days"}`, { size: 10.5, color: BRAND.muted })],
    }),
    detailsTable(report),
    spacer(160),
    summaryTable(report),
    spacer(240),
  ];

  for (const table of report.tables.filter((t) => !t.excelOnly)) {
    body.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 120, after: table.note ? 20 : 100 },
        border: { left: { style: BorderStyle.THICK, size: 24, color: hex(BRAND.orange), space: 6 } },
        children: [run(table.title, { size: 12, font: DISPLAY })],
      }),
    );
    if (table.note) body.push(new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [run(table.note, { size: 8.5, color: BRAND.muted })] }));
    body.push(dataTable(table), spacer(200));
  }

  body.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [run("NOTES", { size: 8, bold: true, color: BRAND.muted, spacing: 20 })] }));
  for (const note of report.notes) body.push(new Paragraph({ spacing: { after: 40 }, children: [run(`•  ${note}`, { size: 8.5, color: BRAND.muted })] }));
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280 },
      border: {
        top: { style: BorderStyle.DASHED, size: 6, color: "C7CCD4", space: 6 },
        bottom: { style: BorderStyle.DASHED, size: 6, color: "C7CCD4", space: 6 },
      },
      children: [run("END OF REPORT", { size: 7.5, bold: true, color: BRAND.muted, spacing: 60 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80 },
      children: [run(`${report.number}  ·  Generated ${formatStamp(report.generatedAt)}`, { size: 7.5, color: BRAND.muted })],
    }),
  );

  const doc = new Document({
    creator: "Feasto",
    title: `${report.kind} · ${report.title} · ${report.period}`,
    subject: report.number,
    styles: { default: { document: { run: { font: BODY, size: 19, color: hex(BRAND.ink) } } } },
    fonts: [
      { name: DISPLAY, data: read("fonts/Poppins-SemiBold.ttf"), characterSet: CharacterSet.ANSI },
      { name: BODY, data: read("fonts/NotoSans-Regular.ttf"), bold: read("fonts/NotoSans-Bold.ttf"), characterSet: CharacterSet.ANSI },
    ],
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 567, footer: 567 } } },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const spacer = (after: number) => new Paragraph({ spacing: { after }, children: [] });

function detailsTable(report: ReportDocument) {
  const rows: TableRow[] = [];
  for (let i = 0; i < report.details.length; i += 2) {
    rows.push(
      new TableRow({
        children: [0, 1].map((k) => {
          const pair = report.details[i + k];
          return new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            margins: { bottom: 100 },
            children: pair
              ? [
                  new Paragraph({ children: [run(pair[0].toUpperCase(), { size: 7, bold: true, color: BRAND.muted, spacing: 20 })] }),
                  new Paragraph({ children: [run(pair[1], { size: 9.5 })] }),
                ]
              : [new Paragraph({ children: [] })],
          });
        }),
      }),
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows });
}

function summaryTable(report: ReportDocument) {
  const edge: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: hex(BRAND.orangeLine) };
  const white: IBorderOptions = { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: report.summary.map(
          (tile) =>
            new TableCell({
              width: { size: 100 / report.summary.length, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(BRAND.orangeSoft) },
              borders: { top: edge, bottom: edge, left: white, right: white },
              margins: { top: 140, bottom: 140, left: 160, right: 160 },
              children: [
                new Paragraph({ children: [run(tile.label.toUpperCase(), { size: 7, bold: true, color: BRAND.orangeDark, spacing: 20 })] }),
                new Paragraph({ spacing: { before: 40 }, children: [run(cellText(tile.value, tile.kind), { size: 14, bold: true })] }),
                ...(tile.note ? [new Paragraph({ children: [run(tile.note, { size: 7.5, color: BRAND.muted })] })] : []),
              ],
            }),
        ),
      }),
    ],
  });
}

function dataTable(table: ReportTable) {
  const totalWeight = table.columns.reduce((n, c) => n + (c.width ?? 1), 0);
  const widths = table.columns.map((c) => Math.round(((c.width ?? 1) / totalWeight) * CONTENT_TWIPS));
  const thin: IBorderOptions = { style: BorderStyle.SINGLE, size: 2, color: hex(BRAND.line) };
  const align = (kind: string) => (kind === "text" ? AlignmentType.LEFT : AlignmentType.RIGHT);

  const cell = (value: Cell, i: number, o: { header?: boolean; bold?: boolean; fill?: string; topRule?: boolean }) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: hex(o.fill) } : undefined,
      borders: { top: o.topRule ? { style: BorderStyle.SINGLE, size: 10, color: hex(BRAND.ink) } : none, bottom: o.header ? none : thin, left: none, right: none },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [
        new Paragraph({
          alignment: align(table.columns[i].kind),
          children: [
            o.header
              ? run(String(value).toUpperCase(), { size: 7.5, bold: true, color: "#FFFFFF", spacing: 10 })
              : run(cellText(value, table.columns[i].kind), { size: 8.5, bold: o.bold }),
          ],
        }),
      ],
    });

  const rows = [
    new TableRow({ tableHeader: true, children: table.columns.map((c, i) => cell(c.label, i, { header: true, fill: BRAND.ink })) }),
    ...(table.rows.length
      ? table.rows.map((r, n) => new TableRow({ cantSplit: true, children: table.columns.map((_, i) => cell(r[i] ?? "", i, { fill: n % 2 ? BRAND.canvas : undefined })) }))
      : [
          new TableRow({
            children: [
              new TableCell({
                columnSpan: table.columns.length,
                margins: { top: 90, bottom: 90, left: 110 },
                borders: { top: none, bottom: thin, left: none, right: none },
                children: [new Paragraph({ children: [run("Nothing in this period.", { size: 8.5, color: BRAND.muted })] })],
              }),
            ],
          }),
        ]),
    ...(table.total ? [new TableRow({ children: table.columns.map((_, i) => cell(table.total![i] ?? "", i, { bold: true, topRule: true })) })] : []),
  ];
  return new Table({ width: { size: CONTENT_TWIPS, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: NO_BORDERS, rows });
}
