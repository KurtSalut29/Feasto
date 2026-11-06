"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useId, useRef } from "react";
import { resizePhoto } from "@/components/ui/image-upload";

const MAX_BYTES = 5 * 1024 * 1024;
// Bigger than menu photos, because the small print on a permit has to stay readable
const MAX_SIDE = 2000;

/** Uploads the signed-in store's permit or rider's license. Throws with a message to show on failure. */
export async function uploadDocument(file: File, url = "/api/documents/mine") {
  let body: Blob = file;
  if (file.type !== "application/pdf") {
    if (!file.type.startsWith("image/")) throw new Error("Choose a photo or a PDF of the document.");
    body = await resizePhoto(file, MAX_SIDE);
  }
  if (body.size > MAX_BYTES) throw new Error("That file is over 5 MB. Try a smaller one.");
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type === "application/pdf" ? "application/pdf" : "image/jpeg" },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Upload failed. Try another file.");
}

/** Chooses the file to upload. The form sends it when it's submitted. */
export function DocumentPicker({
  label,
  hint,
  file,
  onChange,
  error,
}: {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File) => void;
  error?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 ${
          error ? "border-red-500" : file ? "border-emerald-500 bg-emerald-50/50" : "border-gray-300"
        }`}
      >
        {file ? <FileCheck2 className="size-5 shrink-0 text-emerald-600" aria-hidden /> : <Upload className="size-5 shrink-0 text-muted" aria-hidden />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{file ? file.name : "Choose a photo or PDF"}</span>
          <span className="block text-xs text-muted">{file ? "Tap to choose a different file" : hint}</span>
        </span>
      </button>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onChange(chosen);
          event.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
