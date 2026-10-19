"use client";

import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Small icon at the start of the box */
  icon?: LucideIcon;
};

const inputClass =
  "h-11 w-full rounded-xl sm:h-10 border bg-white px-4 text-[15px] text-ink outline-none transition " +
  "placeholder:text-gray-400 focus:ring-4 disabled:bg-canvas disabled:text-muted";

export function TextField({ label, error, hint, icon: Icon, className, type, ...inputProps }: TextFieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="group/field relative">
        {Icon && (
          <Icon
            className={`pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 transition-colors ${
              error ? "text-red-500" : "text-gray-400 group-focus-within/field:text-brand-600"
            }`}
            aria-hidden
          />
        )}
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputClass} ${isPassword ? "pr-11" : ""} ${Icon ? "pl-10" : ""} ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
              : "border-line hover:border-gray-300 focus:border-brand-500 focus:ring-brand-500/15"
          }`}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {revealed ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-red-600">
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="mt-1 text-[13px] text-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
