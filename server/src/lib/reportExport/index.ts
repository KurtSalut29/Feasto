import type { Response } from "express";
import { z } from "zod";
import type { ReportDocument } from "./document.js";
import { renderDocx } from "./docx.js";
import { renderPdf } from "./pdf.js";
import { renderXlsx } from "./xlsx.js";

export const exportFormat = z.enum(["pdf", "docx", "xlsx"], { error: "Pick PDF, Word or Excel." });
export type ExportFormat = z.infer<typeof exportFormat>;

const TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Builds the report in the Feasto format as a PDF, Word or Excel file and sends it as a download. */
export async function sendReport(res: Response, report: ReportDocument, format: ExportFormat) {
  const file = format === "pdf" ? await renderPdf(report) : format === "docx" ? await renderDocx(report) : await renderXlsx(report);
  res.setHeader("Content-Type", TYPES[format]);
  res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}.${format}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(file);
}
