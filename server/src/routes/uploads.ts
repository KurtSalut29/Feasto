import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * Photo uploads. Files go to a Docker volume that all three API copies share and that
 * Nginx serves at /uploads/, so a photo uploaded through api-1 loads through any copy.
 */
export const uploadsRouter = Router();

const MAX_BYTES = 4 * 1024 * 1024;

/** Recognise the image type from the file's first bytes rather than trusting its name. */
function detectImageType(data: Buffer): "jpg" | "png" | "webp" | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.length > 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

uploadsRouter.post(
  "/",
  requireAuth,
  requireRole("VENDOR"),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_BYTES }),
  async (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a JPG, PNG or WebP photo.");
    const extension = detectImageType(data);
    if (!extension) throw new HttpError(400, "That file isn't a JPG, PNG or WebP photo.");

    const name = `${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(path.join(config.uploadDir, name), data);
    res.status(201).json({ url: `/uploads/${name}` });
  },
);
