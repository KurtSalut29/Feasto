"use client";

import { useId } from "react";

/** An on/off switch with a label and short description. Built on a checkbox for keyboard and screen readers. */
export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-2 transition hover:border-gray-300"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
