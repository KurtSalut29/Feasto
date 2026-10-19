"use client";

import { ChevronDown } from "lucide-react";
import { useId, type SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  error?: string;
};

/** A native dropdown styled like TextField. */
export function SelectField({ label, placeholder, options, error, className, value, ...selectProps }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-11 w-full appearance-none rounded-xl border bg-white pr-11 pl-4 text-[15px] outline-none transition focus:ring-4 sm:h-10
            ${value ? "text-ink" : "text-gray-400"}
            ${
              error
                ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                : "border-line hover:border-gray-300 focus:border-brand-500 focus:ring-brand-500/15"
            }`}
          {...selectProps}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value} className="text-ink">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
