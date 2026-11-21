import { Bot, CircleAlert, CircleCheck, CircleX } from "lucide-react";

export type DocCheckResult = {
  verdict: "LOOKS_REAL" | "REVIEW" | "NOT_A_DOCUMENT" | "NOT_CHECKED";
  documentType: string | null;
  nameOnDocument: string | null;
  expiresOn: string | null;
  nameMatches: boolean | null;
  reasons: string[];
} | null;

const LOOK = {
  LOOKS_REAL: { label: "Looks real", Icon: CircleCheck, box: "bg-emerald-50 text-emerald-900 ring-emerald-200", icon: "text-emerald-600" },
  REVIEW: { label: "Needs a closer look", Icon: CircleAlert, box: "bg-amber-50 text-amber-900 ring-amber-200", icon: "text-amber-600" },
  NOT_A_DOCUMENT: { label: "Not a document", Icon: CircleX, box: "bg-red-50 text-red-900 ring-red-200", icon: "text-red-600" },
  NOT_CHECKED: { label: "Not checked automatically", Icon: Bot, box: "bg-canvas text-ink ring-line", icon: "text-gray-500" },
} as const;

/**
 * What the automatic check read in an uploaded document, for the admin: a verdict, what it saw,
 * and why it needs a look. It never decides: the admin still approves or rejects.
 */
export function DocCheck({ check }: { check: DocCheckResult | undefined }) {
  if (!check) return <p className="mt-2 text-xs text-muted">Being checked automatically…</p>;
  const look = LOOK[check.verdict];
  return (
    <div className={`mt-2 rounded-xl px-3 py-2 text-sm ring-1 ${look.box}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <look.Icon className={`size-4 shrink-0 ${look.icon}`} aria-hidden />
        {look.label}
        {check.documentType && check.verdict !== "NOT_CHECKED" && <span className="font-normal opacity-80">· {check.documentType}</span>}
      </p>
      {(check.nameOnDocument || check.expiresOn) && (
        <p className="mt-0.5 text-xs opacity-90">
          {check.nameOnDocument && <>Name: {check.nameOnDocument}{check.nameMatches === true ? " (matches)" : ""}</>}
          {check.nameOnDocument && check.expiresOn && " · "}
          {check.expiresOn && <>Valid until {check.expiresOn}</>}
        </p>
      )}
      {check.reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {check.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
