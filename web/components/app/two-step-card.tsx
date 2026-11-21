"use client";

import { Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatDateTime } from "@/lib/format";
import { BackupCodes, CodeField, SetupQr } from "./two-step-setup";

type Status = {
  enabled: boolean;
  since: string | null;
  required: boolean;
  backupLeft: number;
  devices: { id: string; label: string; lastSeenAt: string; trustedUntil: string | null; createdAt: string }[];
};

type Flow = { kind: "setup"; qr: { otpauthUrl: string; secret: string } | null } | { kind: "codes"; codes: string[] } | { kind: "renew" } | { kind: "off" } | null;

/**
 * Two-step login for someone logged in: turn it on with an authenticator app, get new backup codes,
 * turn it off (not for admins and store owners while it's required), and see where the account
 * was used, with "forget remembered devices".
 */
export function TwoStepCard({ className = "" }: { className?: string }) {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Status>("/auth/two-step/status", reload);
  const [flow, setFlow] = useState<Flow>(null);
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const again = () => setReload((n) => n + 1);

  function open(next: Flow) {
    setFlow(next);
    setCode("");
    setErrors({});
  }

  async function start() {
    open({ kind: "setup", qr: null });
    const result = await apiRequest<{ otpauthUrl: string; secret: string }>("/auth/two-step/start", { method: "POST" });
    if (!result.ok) {
      setFlow(null);
      return void toast.error("Couldn't start", result.error);
    }
    setFlow({ kind: "setup", qr: result.data });
  }

  async function submit(path: string) {
    setBusy(true);
    setErrors({});
    const result = await apiRequest<{ backupCodes?: string[] }>(path, { method: "POST", body: { code } });
    setBusy(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      else setErrors({ code: [result.error] });
      return;
    }
    if (result.data.backupCodes) open({ kind: "codes", codes: result.data.backupCodes });
    else {
      setFlow(null);
      toast.info("Two-step login is off", "You log in with your password only.");
    }
    again();
  }

  async function forget() {
    const result = await apiRequest("/auth/two-step/forget-devices", { method: "POST" });
    if (!result.ok) return void toast.error("Couldn't do it", result.error);
    toast.success("Devices forgotten", "Every device asks for the code at the next login.");
    again();
  }

  return (
    <section aria-label="Two-step login" className={`overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${data?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-gray-500"}`}>
          {data?.enabled ? <ShieldCheck className="size-6" aria-hidden /> : <ShieldOff className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
            Two-step login
            {data && (data.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>)}
            {data?.required && <Badge tone="brand">Required for your account</Badge>}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {!data
              ? "Checking…"
              : data.enabled
                ? `A code from your authenticator app is needed after your password, since ${formatDateTime(data.since!)}. ${data.backupLeft} backup code${data.backupLeft === 1 ? "" : "s"} left.`
                : "Add a code from an authenticator app after your password, so a stolen password isn't enough to get in."}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
          {data && !data.enabled && <Button onClick={start}>Turn on</Button>}
          {data?.enabled && (
            <Button variant="secondary" onClick={() => open({ kind: "renew" })}>
              New backup codes
            </Button>
          )}
          {data?.enabled && !data.required && (
            <Button variant="secondary" className="text-red-700" onClick={() => open({ kind: "off" })}>
              Turn off
            </Button>
          )}
        </div>
      </div>

      {data && data.devices.length > 0 && (
        <div className="border-t border-line px-5 py-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Where you&apos;re logged in</p>
            {data.devices.some((d) => d.trustedUntil && new Date(d.trustedUntil) > new Date()) && (
              <button type="button" onClick={forget} className="text-sm font-semibold text-brand-700 hover:underline">
                Forget remembered devices
              </button>
            )}
          </div>
          <ul className="divide-y divide-line text-sm">
            {data.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <Laptop className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{d.label}</span>
                  <span className="block text-xs text-muted">Last used {formatDateTime(d.lastSeenAt)}</span>
                </span>
                {d.trustedUntil && new Date(d.trustedUntil) > new Date() && <Badge tone="info">Remembered</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">A new device gets you an email and a notification. If one isn&apos;t yours, change your password.</p>
        </div>
      )}

      <Dialog
        open={flow !== null}
        onClose={() => flow?.kind !== "codes" && setFlow(null)}
        title={flow?.kind === "setup" ? "Turn on two-step login" : flow?.kind === "codes" ? "Save your backup codes" : flow?.kind === "renew" ? "New backup codes" : "Turn off two-step login?"}
        description={
          flow?.kind === "setup"
            ? "Scan the QR code, then type the code your app shows."
            : flow?.kind === "renew"
              ? "The old codes stop working. Type a code from your app to get new ones."
              : flow?.kind === "off"
                ? "Your password alone will log you in. Type a code from your app to confirm."
                : undefined
        }
      >
        {flow?.kind === "codes" ? (
          <BackupCodes codes={flow.codes} onDone={() => (setFlow(null), toast.success("Two-step login is ready", "Keep your app and backup codes safe."))} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(flow?.kind === "setup" ? "/auth/two-step/confirm" : flow?.kind === "renew" ? "/auth/two-step/backup-codes" : "/auth/two-step/off");
            }}
          >
            {flow?.kind === "setup" && (flow.qr ? <SetupQr url={flow.qr.otpauthUrl} secret={flow.qr.secret} /> : <div className="h-48 animate-pulse rounded-2xl bg-canvas" />)}
            <CodeField value={code} onChange={setCode} error={errors.code?.[0]} />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setFlow(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} className={flow?.kind === "off" ? "bg-red-600 hover:bg-red-700" : ""}>
                {flow?.kind === "setup" ? "Turn on" : flow?.kind === "renew" ? "Get new codes" : "Turn off"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
