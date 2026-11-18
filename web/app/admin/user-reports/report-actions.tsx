"use client";

import { Ban, CircleOff, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

type Action = "dismiss" | "warn" | "suspend";

const pill =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500";

const COPY: Record<Action, { title: string; label: string; hint: string; button: string; done: string }> = {
  dismiss: { title: "Dismiss the report", label: "Why (only you see this, optional)", hint: "The person who reported hears it was checked.", button: "Dismiss", done: "Report dismissed" },
  warn: { title: "Warn", label: "The warning they'll read", hint: "They read it once, the next time they open Feasto. Another report can mean a suspension.", button: "Send the warning", done: "Warning sent" },
  suspend: { title: "Suspend", label: "Why, for them to read", hint: "They can sign in and finish what they started, but can't start anything new until it ends.", button: "Suspend", done: "Suspended" },
};

/** Dismiss, warn or suspend, from one report */
export function ResolveReport({ id, name, suspendDays }: { id: string; name: string; suspendDays: number[] }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [days, setDays] = useState<number | null>(7);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const open = (a: Action) => {
    setAction(a);
    setNote("");
    setDays(7);
    setErrors({});
  };

  async function send() {
    if (!action) return;
    setBusy(true);
    const result = await apiRequest(`/admin/user-reports/${id}/resolve`, { method: "POST", body: { action, note: note || undefined, ...(action === "suspend" && { days }) } });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error("Couldn't do that", result.error);
      return;
    }
    toast.success(COPY[action].done, name);
    setAction(null);
    router.refresh();
  }

  const copy = action ? COPY[action] : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => open("dismiss")} className={`${pill} border-line bg-white text-ink hover:bg-canvas`}>
          <CircleOff className="size-4" aria-hidden />
          Dismiss
        </button>
        <button type="button" onClick={() => open("warn")} className={`${pill} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`}>
          <TriangleAlert className="size-4" aria-hidden />
          Warn
        </button>
        <button type="button" onClick={() => open("suspend")} className={`${pill} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}>
          <Ban className="size-4" aria-hidden />
          Suspend
        </button>
      </div>

      <Dialog open={action !== null} onClose={() => setAction(null)} title={copy ? `${copy.title}: ${name}` : ""} description={copy?.hint}>
        {action && copy && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {action === "suspend" && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">For how long</legend>
                <div className="flex flex-wrap gap-2">
                  {[...suspendDays, null].map((d) => (
                    <label
                      key={String(d)}
                      className={`inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
                        days === d ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-line text-ink hover:bg-canvas"
                      }`}
                    >
                      <input type="radio" name="days" className="sr-only" checked={days === d} onChange={() => setDays(d)} />
                      {d === null ? "Until I lift it" : `${d} ${d === 1 ? "day" : "days"}`}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <TextareaField
              label={copy.label}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder={action === "dismiss" ? "Nothing in the order chat backs it up." : "We got a report that you placed an order and weren't there to receive it. Please only order when you'll be there."}
              required={action !== "dismiss"}
              error={errors.note?.[0]}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {copy.button}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/** Ends a suspension early */
export function LiftSuspension({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function lift() {
    setBusy(true);
    const result = await apiRequest(`/admin/users/${userId}/lift-suspension`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return toast.error("Couldn't lift it", result.error);
    toast.success("Suspension lifted", name);
    router.refresh();
  }
  return (
    <Button variant="secondary" loading={busy} onClick={lift}>
      Lift suspension
    </Button>
  );
}
