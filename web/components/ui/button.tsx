import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  loading?: boolean;
};

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700",
  secondary: "border border-line bg-white text-ink hover:bg-canvas",
};

export function Button({ variant = "primary", loading, disabled, className = "", children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
        disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
