"use client";

import { useId, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };

export function TextareaField({ label, error, hint, className, ...props }: Props) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        rows={3}
        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-gray-400 focus:ring-4 ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
            : "border-line hover:border-gray-300 focus:border-brand-500 focus:ring-brand-500/15"
        }`}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-[13px] text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}
