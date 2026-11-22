"use client";

import { Camera, CircleCheck, Hand, LoaderCircle, ScanFace, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { documentBody } from "@/components/app/document-upload";

type State = { status: "PENDING" | "VERIFIED" | "REJECTED" | null; note: string | null; selfieAt: string | null; challenge: string | null };

/**
 * The rider's selfie check (Level 3): Feasto asks for a pose right then ("hold up 3 fingers"), so it's
 * a live person and not an old photo; the admin compares it with the license photo.
 */
export function SelfieCheck() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<State>("/rider/selfie", reload);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-canvas" />;
  const asked = challenge ?? data.challenge;

  async function start() {
    setBusy(true);
    const r = await apiRequest<{ challenge: string }>("/rider/selfie/challenge", { method: "POST" });
    setBusy(false);
    if (!r.ok) return void toast.error("Couldn't start it", r.error);
    setChallenge(r.data.challenge);
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const response = await fetch("/api/rider/selfie", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: await documentBody(file) });
      const body = await response.json().catch(() => null);
      if (!response.ok) return void toast.error("Selfie not sent", body?.error ?? "Try again.");
      toast.success("Selfie sent", "The admin compares it with your license photo.");
      setChallenge(null);
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="selfie" className="mt-4 rounded-3xl border border-line bg-white p-5">
      <h2 id="selfie" className="flex items-center gap-2 font-semibold text-ink">
        <ScanFace className="size-5 text-brand-600" aria-hidden />
        Selfie check
      </h2>
      <p className="mt-1 text-sm text-muted">Riders carry other people&apos;s food and cash, so Feasto checks it&apos;s really you: a selfie doing what we ask, matched with your license photo by the admin.</p>
      {data.status === "VERIFIED" && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          <CircleCheck className="size-4" aria-hidden />
          Done: the admin matched your selfie with your license.
        </p>
      )}
      {data.status === "PENDING" && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <LoaderCircle className="size-4" aria-hidden />
          Sent. The admin is checking it.
        </p>
      )}
      {data.status === "REJECTED" && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Take a new one: {data.note}
        </p>
      )}
      {data.status !== "VERIFIED" && data.status !== "PENDING" && (
        <div className="mt-4">
          {asked ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-[0.9375rem] font-semibold text-brand-900">
                <Hand className="mt-0.5 size-5 shrink-0" aria-hidden />
                {asked}, then take the selfie. You have 10 minutes.
              </p>
              <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${busy ? "pointer-events-none opacity-70" : ""}`}>
                {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                Take the selfie
                <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              </label>
            </div>
          ) : (
            <Button className="w-full" loading={busy} onClick={start}>
              <ScanFace className="size-4" aria-hidden />
              {data.status === "REJECTED" ? "Try again" : "Start the selfie check"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
