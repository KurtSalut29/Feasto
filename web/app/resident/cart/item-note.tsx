"use client";

import { MessageSquarePlus, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/browser-api";

const MAX = 120;

/**
 * A note for this one dish ("No onions", "Extra spicy"), for the store. Shown under the dish;
 * "Add note" opens a small box in place, and saving an empty note removes it.
 */
export function ItemNote({ menuItemId, name, note }: { menuItemId: string; name: string; note: string | null }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/cart/items/${menuItemId}/note`, { method: "PUT", body: { note: text.trim() } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return note ? (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Note for ${name}: ${note}. Edit note`}
        className="mt-1.5 flex max-w-full items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-left text-[13px] text-amber-900 ring-1 ring-amber-100 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="min-w-0 break-words">“{note}”</span>
        <Pencil className="mt-0.5 size-3.5 shrink-0 text-amber-700" aria-hidden />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <MessageSquarePlus className="size-3.5" aria-hidden />
        Add note
        <span className="sr-only"> for {name}</span>
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-2">
      <label htmlFor={id} className="sr-only">
        Note for {name}
      </label>
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX}
        autoFocus
        placeholder="e.g. No onions, extra spicy"
        onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setText(note ?? ""))}
        className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-8 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setText(note ?? "");
          }}
          className="h-8 rounded-lg px-2 text-[13px] font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-muted tabular-nums">
          {text.length}/{MAX}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  );
}
