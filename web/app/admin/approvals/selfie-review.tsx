"use client";

import { Check, ScanFace, X } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { timeAgo } from "@/lib/format";

type Row = { id: string; userId: string; selfieChallenge: string | null; selfieAt: string | null; livenessStatus: "PENDING" | "VERIFIED" | "REJECTED" | null; livenessNote: string | null; hasLicense: boolean; user: { name: string } };

/** Admin › Approvals: riders' selfies (Level 3), each next to their license photo, to match by eye */
export function SelfieReview() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<{ riders: Row[] }>("/admin/rider-selfies", reload);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const pending = data?.riders.filter((r) => r.livenessStatus === "PENDING") ?? [];
  if (!data || pending.length === 0) return null;

  async function review(r: Row, decision: "VERIFIED" | "REJECTED") {
    const result = await apiRequest(`/admin/rider-selfies/${r.id}/review`, { method: "POST", body: decision === "VERIFIED" ? { decision } : { decision, note: notes[r.id] ?? "" } });
    if (!result.ok) return setErrors((e) => ({ ...e, [r.id]: result.fieldErrors?.note?.[0] ?? result.error }));
    toast.success(decision === "VERIFIED" ? "Selfie matched" : "Asked for a new selfie", r.user.name);
    setReload((n) => n + 1);
  }

  return (
    <section id="selfies" aria-labelledby="selfies-title" className="mb-5 rounded-3xl border border-line bg-white p-5">
      <h2 id="selfies-title" className="flex items-center gap-2 font-semibold text-ink">
        <ScanFace className="size-5 text-brand-600" aria-hidden />
        Rider selfies to check ({pending.length})
      </h2>
      <p className="text-sm text-muted">Each rider did what Feasto asked right then. Check the pose, and that it&apos;s the same person as on the license.</p>
      <ul className="mt-4 space-y-4">
        {pending.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line p-4">
            <p className="font-semibold text-ink">
              {r.user.name} <span className="text-sm font-normal text-muted">· {r.selfieAt ? timeAgo(r.selfieAt) : ""}</span>
            </p>
            <p className="text-sm text-muted">Asked: &ldquo;{r.selfieChallenge}&rdquo;</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- a private file streamed by the API */}
                <img src={`/api/admin/rider-selfies/${r.id}/photo`} alt={`${r.user.name}'s selfie`} className="aspect-square w-full rounded-xl bg-canvas object-cover" />
                <figcaption className="mt-1 text-xs text-muted">Selfie</figcaption>
              </figure>
              <figure>
                {r.hasLicense ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private file streamed by the API
                  <img src={`/api/documents/rider/${r.id}`} alt={`${r.user.name}'s license`} className="aspect-square w-full rounded-xl bg-canvas object-contain" />
                ) : (
                  <p className="flex aspect-square items-center justify-center rounded-xl bg-canvas text-sm text-muted">No license photo</p>
                )}
                <figcaption className="mt-1 text-xs text-muted">License</figcaption>
              </figure>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <TextField
                label="If it doesn't match, why"
                className="min-w-0 flex-1"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Not the same person, or the pose is wrong"
                error={errors[r.id]}
              />
              <Button variant="secondary" onClick={() => review(r, "REJECTED")}>
                <X className="size-4" aria-hidden />
                Ask again
              </Button>
              <Button onClick={() => review(r, "VERIFIED")}>
                <Check className="size-4" aria-hidden />
                It matches
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
