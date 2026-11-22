import { inflateRawSync } from "node:zlib";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { UNITS } from "./pabili.js";

/**
 * Pabili: a resident's shopping list read for them, from a photo of a handwritten or printed list,
 * a PDF, or a Word file. Claude reads it into lines (name, how much, the unit, details, a price if
 * written); the resident checks every line before sending, and the usual rules (prescriptions,
 * 18+, not allowed) still run on what they send. It only fills the form: it never sends anything.
 *
 * Without ANTHROPIC_API_KEY it's off, and the form simply doesn't offer it.
 */

const MODEL = process.env.LIST_READER_MODEL || process.env.DOCUMENT_CHECK_MODEL || "claude-opus-5-5";
const WAIT_MS = 30_000;
export const listReaderOn = () => Boolean(process.env.ANTHROPIC_API_KEY);

const Line = z.object({
  name: z.string().describe("What to buy, as written (Filipino or English), without the amount"),
  quantity: z.number().describe("How many or how much; 1 when not written"),
  unit: z.enum(UNITS).describe("pc for pieces when not written; kg/g/L/mL for weights and volumes"),
  details: z.string().describe("Brand, size or other details written for it, or empty"),
  estimate_pesos: z.number().nullable().describe("A price written next to it, in pesos, or null"),
});

const Reading = z.object({
  is_shopping_list: z.boolean().describe("False when the file isn't a list of things to buy"),
  items: z.array(Line).max(20),
  /** Lines it saw but couldn't read */
  unreadable: z.array(z.string()).max(10),
});

export type ListLine = { name: string; quantity: number; unit: (typeof UNITS)[number]; note: string | null; estimate: number | null };

const MEDIA = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** The text of a Word file: its main part, read straight from the ZIP (no library needed) */
export function docxText(data: Buffer): string | null {
  // The central directory lists each file with where its local header is
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) return null;
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  for (let i = 0; i < count && at + 46 <= data.length; i++) {
    if (data.readUInt32LE(at) !== 0x02014b50) return null;
    const method = data.readUInt16LE(at + 10);
    const size = data.readUInt32LE(at + 20);
    const nameLength = data.readUInt16LE(at + 28);
    const extra = data.readUInt16LE(at + 30);
    const comment = data.readUInt16LE(at + 32);
    const local = data.readUInt32LE(at + 42);
    const name = data.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    if (name === "word/document.xml") {
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
      const raw = data.subarray(start, start + size);
      const xml = (method === 0 ? raw : inflateRawSync(raw)).toString("utf8");
      // One line per paragraph, the text of its runs
      return xml
        .split(/<\/w:p>/)
        .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))
        .map((t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, 8000);
    }
    at += 46 + nameLength + extra + comment;
  }
  return null;
}

let client: Anthropic | null = null;

/** Reads a list file into lines the form can show, or says why it couldn't */
export async function readList(data: Buffer, kind: "jpg" | "png" | "webp" | "pdf" | "docx"): Promise<{ items: ListLine[]; unreadable: string[]; problem: string | null }> {
  if (!listReaderOn()) return { items: [], unreadable: [], problem: "Reading lists isn't set up yet. Type the items instead." };
  let source: Anthropic.ContentBlockParam;
  if (kind === "docx") {
    const text = docxText(data);
    if (!text) return { items: [], unreadable: [], problem: "That Word file couldn't be opened. Save it again, or take a photo of the list." };
    source = { type: "text", text: `The list, from a Word file:\n\n${text}` };
  } else if (kind === "pdf") {
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") } };
  } else {
    source = { type: "image", source: { type: "base64", media_type: MEDIA[kind], data: data.toString("base64") } };
  }
  client ??= new Anthropic();
  try {
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 3000,
        output_config: { effort: "low", format: zodOutputFormat(Reading) },
        system:
          "You read shopping lists for Feasto Pabili, a buy-and-deliver service in Naval, Biliran, Philippines. Lists are in Filipino, Waray, English or a mix, often handwritten. " +
          "Turn each thing to buy into one line: its name, how much, the unit and any details. Keep the names as written (e.g. 'bangus', 'Tanduay'). " +
          "Read only what is there; never add items. A line you can't make out goes in unreadable. The resident checks every line before sending.",
        messages: [{ role: "user", content: [source, { type: "text", text: "Read this list into lines." }] }],
      },
      { timeout: WAIT_MS, maxRetries: 1 },
    );
    const parsed = response.parsed_output;
    if (!parsed) return { items: [], unreadable: [], problem: response.stop_reason === "refusal" ? "That list couldn't be read. Type the items instead." : "The list couldn't be read. Try a clearer photo." };
    if (!parsed.is_shopping_list || parsed.items.length === 0) return { items: [], unreadable: parsed.unreadable, problem: "That doesn't look like a list of things to buy. Try another photo, or type the items." };
    return {
      items: parsed.items.slice(0, 20).map((l) => ({
        name: l.name.trim().slice(0, 80),
        quantity: l.quantity > 0 && l.quantity <= 1000 ? Math.round(l.quantity * 100) / 100 : 1,
        unit: l.unit,
        note: l.details.trim().slice(0, 120) || null,
        estimate: l.estimate_pesos != null && l.estimate_pesos > 0 && l.estimate_pesos < 100000 ? Math.round(l.estimate_pesos * 100) / 100 : null,
      })),
      unreadable: parsed.unreadable.slice(0, 10),
      problem: null,
    };
  } catch (error) {
    return { items: [], unreadable: [], problem: error instanceof Anthropic.APIError ? `The list couldn't be read right now (${error.status ?? "no answer"}). Type the items instead.` : "The list couldn't be read right now. Type the items instead." };
  }
}
