"use client";

import { Camera, ImagePlus, LoaderCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type DragEvent } from "react";
import { uploadPhoto } from "@/components/ui/image-upload";
import { toast } from "@/components/ui/toast";

/**
 * The store's cover photo, shown the way residents will see it: as the card in store lists
 * (4:3) and as the round photo at the top of the store page. Change and Remove are real,
 * labelled buttons; a removed photo can be put back with Undo until the store is saved.
 * A photo can also be dropped onto the frame.
 */
export function CoverPhotoField({ value, onChange, storeName }: { value: string | null; onChange: (url: string | null) => void; storeName: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  /** The photo just removed, so Undo can bring it back */
  const [removed, setRemoved] = useState<string | null>(null);

  const choose = () => input.current?.click();

  async function upload(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      onChange(await uploadPhoto(file));
      setRemoved(null);
      toast.success("Cover photo uploaded", "Save your store to show it to residents.", { duration: 3500 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn't upload. Try another one.");
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    setRemoved(value);
    onChange(null);
    setError(undefined);
  }

  function undo() {
    onChange(removed);
    setRemoved(null);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const button =
    "inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold whitespace-nowrap transition sm:flex-none sm:px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50";

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:items-start">
      {/* The frame: the photo as a store card, or a drop zone when there's none */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`group relative aspect-[4/3] w-full overflow-hidden rounded-2xl transition ${
          value ? "bg-canvas ring-1 ring-line" : "border-2 border-dashed bg-canvas/70"
        } ${dragging ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500" : value ? "" : "border-gray-300"}`}
      >
        {value ? (
          <>
            <Image src={value} alt={`Cover photo of ${storeName || "your store"}`} fill unoptimized className="object-cover" />
            {/* Clicking the photo changes it too */}
            <button
              type="button"
              onClick={choose}
              disabled={uploading}
              aria-label="Change cover photo"
              className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-black/0 to-black/0 p-3 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink shadow">
                <Camera className="size-3.5" aria-hidden />
                Change photo
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={choose}
            disabled={uploading}
            className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-line">
              <ImagePlus className="size-6" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-ink">{dragging ? "Drop the photo here" : "Add a cover photo"}</span>
            <span className="text-xs text-muted">Click to choose, or drag a photo here</span>
          </button>
        )}
        {uploading && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm font-semibold text-ink backdrop-blur-sm" role="status">
            <LoaderCircle className="size-7 animate-spin text-brand-600" aria-hidden />
            Uploading…
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink">Cover photo</p>
          <p className="mt-0.5 text-sm text-muted">Residents see it in the store list and at the top of your store page. A bright, close photo of your best dish works best.</p>
        </div>

        {/* The actions, each saying what it does */}
        <div className="flex gap-2">
          <button type="button" onClick={choose} disabled={uploading} className={`${button} bg-brand-600 text-white shadow-sm hover:bg-brand-700`}>
            {value ? <Camera className="size-4" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            {value ? "Change photo" : "Upload photo"}
          </button>
          {value && (
            <button type="button" onClick={remove} disabled={uploading} className={`${button} border border-line bg-white text-red-600 hover:border-red-200 hover:bg-red-50`}>
              <Trash2 className="size-4" aria-hidden />
              Remove photo
            </button>
          )}
        </div>

        {removed && !value && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="status">
            Photo removed. Save your store to make it final.
            <button type="button" onClick={undo} className="inline-flex items-center gap-1 font-semibold text-amber-900 underline underline-offset-2 hover:no-underline">
              <RotateCcw className="size-3.5" aria-hidden />
              Undo
            </button>
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <p className="text-xs text-gray-500">JPG, PNG or WebP, up to 4 MB. Large photos are made smaller for you.</p>

        {/* How it looks on the store page */}
        <div className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-brand-50 ring-2 ring-white">
            {value && <Image src={value} alt="" fill unoptimized className="object-cover" />}
          </span>
          <span className="min-w-0 text-sm">
            <span className="block truncate font-semibold text-ink">{storeName || "Your store"}</span>
            <span className="block text-xs text-muted">How it shows at the top of your store page</span>
          </span>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Cover photo file"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
