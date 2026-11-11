"use client";

import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { type PhotoUse, presentPhoto } from "@/lib/present-photo";
import { toast } from "./toast";

const MAX_SIDE = 1200;

/**
 * Shrinks a photo in the browser so uploads from phones are small and fast. With a `use`, a store
 * logo or a dish poster is also fitted to the app's frames first (see lib/present-photo.ts).
 */
export async function resizePhoto(file: File, maxSide = MAX_SIDE, use?: PhotoUse): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const fitted = use ? presentPhoto(bitmap, bitmap.width, bitmap.height, use) : null;
  const scale = fitted ? 1 : Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = fitted ?? document.createElement("canvas");
  if (!fitted) {
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    // A transparent PNG logo goes on white, not black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("resize failed"))), "image/jpeg", 0.85),
  );
}

/** Shrinks and uploads a photo, returning its /uploads/... URL. Throws with a message to show on failure. */
export async function uploadPhoto(file: File, use?: PhotoUse): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");
  const body = await resizePhoto(file, MAX_SIDE, use);
  const response = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Upload failed. Try another photo.");
  return data.url;
}

/** Upload a photo and get back its /uploads/... URL. */
export function ImageUpload({
  label,
  value,
  onChange,
  shape = "wide",
  use,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: "wide" | "square";
  /** Fits the photo to where it shows (a store logo, a dish poster) before uploading */
  use?: PhotoUse;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      onChange(await uploadPhoto(file, use));
      toast.success("Photo uploaded", "Remember to save to keep it.", { duration: 3000 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try another photo.");
    } finally {
      setUploading(false);
    }
  }

  const box = shape === "wide" ? "aspect-[16/9] w-full" : "size-28";

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink">{label}</p>
      <div className={shape === "wide" ? "space-y-2" : "flex items-end gap-3"}>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`relative ${box} shrink-0 overflow-hidden rounded-xl border border-dashed border-gray-300 bg-canvas text-muted transition hover:border-brand-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500`}
        >
          {value ? (
            <Image src={value} alt="" fill unoptimized className="object-cover" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-sm">
              <ImagePlus className="size-6" aria-hidden />
              Add photo
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <LoaderCircle className="size-6 animate-spin text-brand-600" aria-hidden />
            </span>
          )}
        </button>
        {value && !uploading && (
          <div className={`flex gap-2 ${shape === "wide" ? "items-center gap-x-5" : "flex-col"}`}>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Camera className="size-4" aria-hidden />
              Change photo
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </button>
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </div>
  );
}
