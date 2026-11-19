import { Check } from "lucide-react";

/** The same rules the server checks (server/src/lib/identity.ts newPassword) */
export const PASSWORD_RULES = [
  { label: "8+ characters", met: (p: string) => p.length >= 8 },
  { label: "A small letter", met: (p: string) => /[a-z]/.test(p) },
  { label: "A capital letter", met: (p: string) => /[A-Z]/.test(p) },
  { label: "A number", met: (p: string) => /\d/.test(p) },
  { label: "A symbol, like @ # $ !", met: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
];

export const passwordMeetsRules = (p: string) => PASSWORD_RULES.every((rule) => rule.met(p));

/** The first rule a password still misses, as a sentence, or null */
export function passwordProblem(p: string) {
  if (p.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/.test(p)) return "Include a small letter (a–z).";
  if (!/[A-Z]/.test(p)) return "Include a capital letter (A–Z).";
  if (!/\d/.test(p)) return "Include a number (0–9).";
  if (!/[^A-Za-z0-9\s]/.test(p)) return "Include a special character, like @ # $ % ! or *.";
  return null;
}

/** Each rule as a chip that ticks green once it's met */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul aria-label="Your password needs" className="mt-2.5 flex flex-wrap gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.met(password);
        return (
          <li
            key={rule.label}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              met ? "bg-emerald-100 text-emerald-800" : "bg-white text-muted ring-1 ring-line"
            }`}
          >
            <span aria-hidden className={`flex size-3.5 items-center justify-center rounded-full transition-colors ${met ? "bg-emerald-600 text-white" : "bg-line"}`}>
              {met && <Check className="size-2.5 motion-safe:animate-[pop_0.25s_ease-out]" strokeWidth={3.5} />}
            </span>
            {rule.label}
            <span className="sr-only">{met ? " (done)" : " (not yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

const STRENGTH = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Good", bar: "bg-emerald-500", text: "text-emerald-700" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
  { label: "Very strong", bar: "bg-emerald-700", text: "text-emerald-800" },
];

/** 4 bars that fill as the password gets stronger. "Too weak" until it meets every rule; longer is stronger. */
export function PasswordStrength({ password }: { password: string }) {
  const met = PASSWORD_RULES.filter((rule) => rule.met(password)).length;
  const ok = met === PASSWORD_RULES.length;
  const extras = Number(password.length >= 12) + Number(password.length >= 16);
  const level = STRENGTH[ok ? 1 + extras : 0];
  const filled = ok ? 2 + extras : Math.min(1, met);
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < filled ? level.bar : "bg-line"}`} />
        ))}
      </div>
      <span aria-live="polite" className={`text-xs font-semibold ${level.text}`}>
        {level.label}
      </span>
    </div>
  );
}
