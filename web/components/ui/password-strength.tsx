const STRENGTH = [
  { label: "Too weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-700" },
  { label: "Good", bar: "bg-emerald-500", text: "text-emerald-700" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
];

/** 4 bars that fill as the password gets stronger. "Too weak" until it meets the rules (8+ characters, a letter and a number). */
export function PasswordStrength({ password }: { password: string }) {
  const meetsRules = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  const extras =
    Number(password.length >= 12) +
    Number(/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password)));
  const level = STRENGTH[meetsRules ? 1 + extras : 0];
  const filled = meetsRules ? 2 + extras : 1;
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
