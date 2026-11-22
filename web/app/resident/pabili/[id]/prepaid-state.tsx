"use client";

import { CircleCheck, CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { Errand } from "../errand";

/**
 * A Pabili paid online first: the payment (and, back from Xendit's page, a check until it's known),
 * and what came back.
 */
export function PrepaidState({ errand }: { errand: Errand }) {
  const router = useRouter();
  const back = useSearchParams().get("pay") === "1";
  const [checking, setChecking] = useState(back && errand.paymentStatus === "PENDING");

  useEffect(() => {
    if (!checking) return;
    let stop = false;
    let tries = 0;
    const ask = async () => {
      const r = await apiRequest<{ status: string | null }>(`/errands/${errand.id}/payment`);
      if (stop) return;
      if ((r.ok && r.data.status !== "PENDING") || tries++ > 12) {
        setChecking(false);
        router.replace(`/resident/pabili/${errand.id}`);
        router.refresh();
      } else setTimeout(ask, 2500);
    };
    void ask();
    return () => {
      stop = true;
    };
  }, [checking, errand.id, router]);

  const refunded = Number(errand.refundedAmount ?? 0);
  if (checking)
    return (
      <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm text-ink">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Checking your payment…
      </p>
    );
  if (errand.paymentStatus === "PENDING")
    return (
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Not paid yet: riders see it once it&apos;s paid.{" "}
          {errand.paymentUrl && (
            <a href={errand.paymentUrl} className="tap font-semibold underline">
              Pay now
            </a>
          )}
        </span>
      </p>
    );
  if (errand.paymentStatus === "FAILED") return <p className="mb-3 rounded-xl bg-canvas px-3 py-2 text-sm text-muted">It wasn&apos;t paid, so nothing was charged.</p>;
  return (
    <p className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {formatPeso(Number(errand.paidAmount ?? 0))} paid online. Nothing to pay at the door.
        {refunded > 0 && ` ${formatPeso(refunded)} came back to you.`}
      </span>
    </p>
  );
}
