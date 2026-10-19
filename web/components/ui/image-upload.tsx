"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

const MAX_SIDE = 1200;

/** Shrinks a photo in the browser so uploads from phones are small and fast. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("resize failed"))), "image/jpeg", 0.85),
  );
}

/** Upload a photo and get back its /uploads/... URL. */
export function ImageUpload({
  label,
  value,
  onChange,
  shape = "wide",
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  shape?: "wide" | "square";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(file: File) {
    setError(undefined);
    if (!file.type.startsWith("image/")) return setError("Choose a photo (JPG, PNG or WebP).");
    setUploading(true);
    try {
      const body = await resize(file);
      const response = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Upload failed. Try another photo.");
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try another photo.");
    } finally {
      setUploading(false);
    }
  }

  const box = shape === "wide" ? "aspect-[16/7] w-full" : "size-28";

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink">{label}</p>
      <div className="flex items-end gap-3">
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
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => input.current?.click()} className="text-sm font-semibold text-brand-700 hover:underline">
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-red-600"
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
