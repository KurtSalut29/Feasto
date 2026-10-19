"use client";

import type { LucideIcon } from "lucide-react";

export type SegmentOption<T extends string> = { value: T; label: string; Icon?: LucideIcon };

/** A row of mutually exclusive choices, built from radio buttons so it works with the keyboard. */
export function SegmentedControl<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  options: SegmentOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div
        className={`grid gap-1 rounded-xl bg-canvas p-1 ${error ? "ring-1 ring-red-500" : ""}`}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map(({ value: optionValue, label, Icon }) => (
          <label
            key={optionValue}
            className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted transition
              hover:text-ink has-checked:bg-white has-checked:font-semibold has-checked:text-ink has-checked:shadow-sm has-checked:ring-1 has-checked:ring-line
              has-focus-visible:outline-2 has-focus-visible:outline-brand-500"
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className="sr-only"
            />
            {Icon && <Icon className={`size-4 ${value === optionValue ? "text-brand-600" : ""}`} aria-hidden />}
            {label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-[13px] text-red-600">{error}</p>}
    </fieldset>
  );
}
