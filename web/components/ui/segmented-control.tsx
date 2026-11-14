"use client";

import type { LucideIcon } from "lucide-react";

export type SegmentOption<T extends string> = { value: T; label: string; Icon?: LucideIcon };

/**
 * A row of mutually exclusive choices, built from radio buttons so it works with the keyboard.
 * The white "chosen" pill slides to the option picked (the options are equal widths, so it's pure CSS).
 */
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
  const chosen = options.findIndex((o) => o.value === value);
  const count = options.length;
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div
        className={`relative grid gap-1 rounded-xl bg-canvas p-1 ${error ? "ring-1 ring-red-500" : ""}`}
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-white shadow-sm ring-1 ring-line transition-[transform,opacity] duration-200 ease-[var(--ease-in-out)] motion-reduce:transition-none ${chosen < 0 ? "opacity-0" : ""}`}
          style={{
            width: `calc((100% - 0.5rem - ${count - 1} * 0.25rem) / ${count})`,
            transform: `translateX(calc(${Math.max(chosen, 0)} * (100% + 0.25rem)))`,
          }}
        />
        {options.map(({ value: optionValue, label, Icon }) => (
          <label
            key={optionValue}
            className="relative flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted transition-colors
              hover:text-ink has-checked:font-semibold has-checked:text-ink
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
      {error && <p className="mt-1 text-[0.8125rem] text-red-600">{error}</p>}
    </fieldset>
  );
}
