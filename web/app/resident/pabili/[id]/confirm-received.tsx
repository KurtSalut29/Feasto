"use client";

import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";

/**
 * After the rider hands it over: the resident says they got everything. A missing or wrong item
 * goes through "Report a problem" (below), with the receipt and the photos to look at.
 */
export function ConfirmReceived({ id, riderName }: { id: string; riderName: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    const result = await apiRequest(`/errands/${id}/confirm`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return void toast.error("Couldn't confirm", result.error);
    toast.success("Thanks!", "Glad everything arrived.");
    router.refresh();
  }
  return (
    <section aria-label="Did you get everything?" className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <p className="flex items-center gap-2 font-semibold text-emerald-900">
        <PackageCheck className="size-5" aria-hidden />
        Did you get everything?
      </p>
      <p className="mt-1 text-sm text-emerald-900">
        Check the items against the receipt{riderName ? ` while ${riderName.split(" ")[0]} is there` : ""}. If something&apos;s missing or wrong, tap &ldquo;Report a problem&rdquo; below instead.
      </p>
      <Button className="mt-3 w-full sm:w-auto" loading={busy} onClick={confirm}>
        Yes, I got everything
      </Button>
    </section>
  );
}
