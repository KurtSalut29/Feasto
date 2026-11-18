"use client";

import { Ban, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/browser-api";
import { REFRESH_EVENT } from "./live-updates";

type Me = {
  suspension: { until: string; untilLifted: boolean; text: string } | null;
  warning: { id: string; kind: "WARNED" | "SUSPENDED"; reason: string; message: string | null } | null;
};

const BLOCKED = { RESIDENT: "You can't order, book a table or ask for a Pabili", RIDER: "You can't go online or take jobs", VENDOR: "Your store isn't taking new orders or bookings" } as const;

/**
 * What the admin decided after a report about this person: a warning they read once (a dialog,
 * after signing in), and a banner on every page while a suspension runs, saying until when and
 * what it stops. Loads again with the page's background refresh, so a lifted suspension goes away.
 */
export function AccountNotice({ role }: { role: keyof typeof BLOCKED }) {
  const [me, setMe] = useState<Me | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void apiRequest<Me>("/reports/me").then((r) => {
        if (!cancelled && r.ok) setMe(r.data);
      });
    load();
    window.addEventListener(REFRESH_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, []);

  async function seen() {
    if (!me?.warning) return;
    setClosing(true);
    await apiRequest(`/reports/me/${me.warning.id}/seen`, { method: "POST" });
    setClosing(false);
    setMe({ ...me, warning: null });
  }

  const warning = me?.warning;
  return (
    <>
      {me?.suspension && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <Ban className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
          <p>
            <span className="font-semibold">Your account is suspended {me.suspension.text}</span> because of a report. {BLOCKED[role]} until then. What you already started can still be
            finished.
          </p>
        </div>
      )}
      <Dialog
        open={Boolean(warning)}
        onClose={() => void seen()}
        title={warning?.kind === "SUSPENDED" ? "Your account is suspended" : "Feasto warned you"}
        description={warning ? `After a report: ${warning.reason.toLowerCase()}.` : undefined}
      >
        {warning && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-3 py-3 text-amber-900">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              <p className="text-[0.9375rem]">{warning.message ?? "Please follow Feasto's Terms."}</p>
            </div>
            <p className="text-sm text-muted">
              {warning.kind === "SUSPENDED" && me?.suspension
                ? `It lasts ${me.suspension.text}. Another report after it can mean a longer suspension.`
                : "Another report can get your account suspended."}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => void seen()} loading={closing}>
                I understand
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
