"use client";

import { Camera, Check, Flag, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { uploadPhoto } from "@/components/ui/image-upload";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

type PartyRole = "RESIDENT" | "RIDER" | "VENDOR";
type Reason = "PRANK_ORDER" | "NO_SHOW" | "RUDE" | "UNSAFE_DRIVING" | "WRONG_ITEMS" | "OFF_APP_PAYMENT" | "OTHER";

/** What can go wrong with each kind of person, worded for them */
const REASONS: Record<PartyRole, { value: Reason; label: string }[]> = {
  RESIDENT: [
    { value: "PRANK_ORDER", label: "Fake or prank order" },
    { value: "NO_SHOW", label: "Wasn't there or didn't pay" },
    { value: "RUDE", label: "Rude or harassing" },
    { value: "OTHER", label: "Something else" },
  ],
  RIDER: [
    { value: "NO_SHOW", label: "Didn't come or didn't deliver" },
    { value: "RUDE", label: "Rude or harassing" },
    { value: "UNSAFE_DRIVING", label: "Unsafe driving" },
    { value: "WRONG_ITEMS", label: "Wrong or missing items" },
    { value: "OFF_APP_PAYMENT", label: "Asked for more money than the app shows" },
    { value: "OTHER", label: "Something else" },
  ],
  VENDOR: [
    { value: "WRONG_ITEMS", label: "Wrong or missing items" },
    { value: "RUDE", label: "Rude or harassing" },
    { value: "OFF_APP_PAYMENT", label: "Asked for more money than the app shows" },
    { value: "OTHER", label: "Something else" },
  ],
};
const WHO: Record<PartyRole, string> = { RESIDENT: "the customer", RIDER: "the rider", VENDOR: "the store" };

type Target = { orderId?: string; errandId?: string; bookingId?: string };
const query = (t: Target) => new URLSearchParams(Object.entries(t).filter(([, v]) => v) as [string, string][]).toString();

const choice =
  "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[0.9375rem] transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500";

/**
 * "Report a problem" on an order, Pabili or booking: tell the admin about the store, rider or
 * customer in it (a prank order, a no-show, rudeness, unsafe driving…). The admin reads it with
 * the order and can dismiss it, warn the person, or suspend them. One report per person each time.
 */
export function ReportProblem({
  target,
  people,
  compact = false,
  className = "",
}: {
  target: Target;
  people: { role: PartyRole; name: string }[];
  /** A small text link, for rows in a list */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<PartyRole | null>(people.length === 1 ? people[0]!.role : null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<PartyRole[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const key = query(target);

  const [loaded, setLoaded] = useState(false);
  const loadDone = async () => {
    const r = await apiRequest<{ reported: { reportedRole: PartyRole }[] }>(`/reports/for?${key}`);
    const roles = r.ok ? r.data.reported.map((x) => x.reportedRole) : [];
    setDone(roles);
    setLoaded(true);
    return roles;
  };
  // One button on a page asks right away (so it can say "Reported"); rows in a list ask when tapped
  useEffect(() => {
    // The state is set once the request answers, not while the effect runs
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!compact) void loadDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, compact]);

  if (people.length === 0) return null;
  const left = people.filter((p) => !done.includes(p.role));
  const allDone = left.length === 0;

  async function start() {
    let remaining = left;
    if (!loaded) {
      const roles = await loadDone();
      remaining = people.filter((p) => !roles.includes(p.role));
      if (remaining.length === 0) return toast.success("Already reported", "Feasto's admin is looking into it.");
    }
    setWho(remaining.length === 1 ? remaining[0]!.role : null);
    setReason(null);
    setDetails("");
    setPhoto(null);
    setErrors({});
    setOpen(true);
  }

  async function take(file: File) {
    setUploading(true);
    try {
      setPhoto(await uploadPhoto(file));
    } catch (e) {
      toast.error("Couldn't add the photo", e instanceof Error ? e.message : "Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const problems: FieldErrors = {
      ...(!who && { reportedRole: ["Choose who you're reporting."] }),
      ...(!reason && { reason: ["Choose what happened."] }),
      ...(details.trim().length < 10 && { details: ["Tell us what happened in a few words (at least 10 letters)."] }),
    };
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSending(true);
    const result = await apiRequest("/reports", { method: "POST", body: { ...target, reportedRole: who, reason, details, photoUrl: photo ?? undefined } });
    setSending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error("Couldn't send the report", result.error);
      return;
    }
    setDone((d) => [...d, who!]);
    setOpen(false);
    toast.success("Report sent", "Feasto's admin will look into it and let you know.");
  }

  const name = people.find((p) => p.role === who)?.name;
  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={allDone}
        className={`inline-flex items-center gap-2 rounded-full font-semibold text-muted transition ${compact ? "h-8 px-2 text-[0.8125rem]" : "h-10 px-3 text-sm"} hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted ${className}`}
      >
        {allDone ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Flag className="size-4" aria-hidden />}
        {allDone ? (compact ? "Reported" : "Reported. The admin is looking into it.") : compact ? "Report" : "Report a problem"}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Report a problem" description="Only Feasto's admin reads this. The person you report doesn't see your name.">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {left.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">Who are you reporting?</legend>
              <div className="space-y-2">
                {left.map((p) => (
                  <label key={p.role} className={`${choice} ${who === p.role ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"}`}>
                    <input
                      type="radio"
                      name="who"
                      className="sr-only"
                      checked={who === p.role}
                      onChange={() => {
                        setWho(p.role);
                        setReason(null);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{p.name}</span>
                      <span className="block text-sm text-muted capitalize">{WHO[p.role].replace("the ", "")}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.reportedRole && <p className="mt-1 text-sm text-red-600">{errors.reportedRole[0]}</p>}
            </fieldset>
          )}

          {who && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">What happened{left.length === 1 && name ? ` with ${name}` : ""}?</legend>
              <div className="space-y-2">
                {REASONS[who].map((r) => (
                  <label key={r.value} className={`${choice} ${reason === r.value ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"}`}>
                    <input type="radio" name="reason" className="sr-only" checked={reason === r.value} onChange={() => setReason(r.value)} />
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${reason === r.value ? "border-brand-600 bg-brand-600" : "border-gray-400"}`} aria-hidden>
                      {reason === r.value && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-ink">{r.label}</span>
                  </label>
                ))}
              </div>
              {errors.reason && <p className="mt-1 text-sm text-red-600">{errors.reason[0]}</p>}
            </fieldset>
          )}

          <TextareaField
            label="What happened"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="When it happened and what they did or said."
            required
            error={errors.details?.[0]}
          />

          <div>
            <p className="mb-1 text-sm font-medium text-ink">A photo (optional)</p>
            {photo ? (
              <div className="relative h-32 w-40 overflow-hidden rounded-xl bg-canvas">
                <Image src={photo} alt="The photo for the report" fill unoptimized className="object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label="Remove the photo"
                  className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={uploading}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4 text-brand-600" aria-hidden />}
                {uploading ? "Adding…" : "Add a photo"}
              </button>
            )}
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void take(file);
                e.target.value = "";
              }}
            />
          </div>

          <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted">False reports break the Terms and can get your own account warned.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={sending} disabled={uploading}>
              Send report
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
