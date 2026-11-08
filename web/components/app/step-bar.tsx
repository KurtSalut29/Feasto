/** A short bar of steps, filled up to the one reached, with the first and last named under it. */
export function StepBar({ steps, done, tone = "brand" }: { steps: string[]; done: number; tone?: "brand" | "light" }) {
  const on = tone === "light" ? "bg-white" : "bg-brand-600";
  const off = tone === "light" ? "bg-white/30" : "bg-brand-100";
  return (
    <div>
      <ol className="flex gap-1" aria-label={`Step ${done + 1} of ${steps.length}: ${steps[done]}`}>
        {steps.map((step, i) => (
          <li key={step} className={`h-1.5 flex-1 rounded-full ${i <= done ? on : off}`}>
            <span className="sr-only">
              {step}
              {i <= done ? ", done" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div className={`mt-1 flex justify-between text-[11px] ${tone === "light" ? "text-white/80" : "text-muted"}`} aria-hidden>
        {steps.map((step, i) => (
          <span key={step} className={i === done ? (tone === "light" ? "font-semibold text-white" : "font-semibold text-brand-700") : ""}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
