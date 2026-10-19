import Link from "next/link";

/** Extra styling for the main button on the login and register cards. */
export const AUTH_BUTTON =
  "bg-gradient-to-b from-brand-600 to-brand-700 shadow-[0_10px_24px_-10px_rgba(210,70,0,0.75)] hover:from-brand-700";

/** "New to Feasto? Create an account" line at the bottom of the card. */
export function AuthSwitch({ question, href, action }: { question: string; href: string; action: string }) {
  return (
    <div className="mt-4 border-t border-line pt-3 text-center text-sm text-muted">
      {question}{" "}
      <Link
        href={href}
        className="rounded font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        {action}
      </Link>
    </div>
  );
}
