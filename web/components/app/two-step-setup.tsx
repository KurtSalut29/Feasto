"use client";

import { Copy, Download, KeyRound, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";

/** The QR code an authenticator app scans, drawn in the browser (the secret never leaves this page) */
export function SetupQr({ url, secret }: { url: string; secret: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(null));
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="QR code for your authenticator app" width={176} height={176} className="size-44 shrink-0 rounded-lg" /> : <div className="size-44 shrink-0 animate-pulse rounded-lg bg-canvas" />}
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-semibold text-ink">Scan it with your authenticator app</p>
        <p className="text-muted">Google Authenticator, Microsoft Authenticator or Authy: tap +, then scan. On this same phone, type the key instead:</p>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(secret.replace(/\s/g, "")).then(() => toast.success("Key copied", "Paste it in your app as a new account."))}
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-left font-mono text-[0.8125rem] break-all text-ink hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {secret}
          <Copy className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Copy the key</span>
        </button>
      </div>
    </div>
  );
}

/** The one-time backup codes, shown once: copy or download before going on */
export function BackupCodes({ codes, onDone, doneLabel = "I saved them" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = `Feasto backup codes. Each works once, if you lose your phone.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <KeyRound className="size-4" aria-hidden />
          Your backup codes
        </p>
        <p className="mt-1 text-sm text-amber-900">If you lose your phone, each code logs you in once. They won&apos;t be shown again, so keep them somewhere safe.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[0.9375rem] text-ink">
          {codes.map((c) => (
            <li key={c} className="rounded-lg bg-white px-3 py-1.5 text-center tabular-nums ring-1 ring-amber-200">
              {c}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard?.writeText(text).then(() => (setSaved(true), toast.success("Codes copied", "Paste them somewhere safe.")))}
        >
          <Copy className="size-4" aria-hidden />
          Copy
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = "feasto-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
            setSaved(true);
          }}
        >
          <Download className="size-4" aria-hidden />
          Download
        </Button>
      </div>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {saved ? doneLabel : "Copy or download them first"}
      </Button>
    </div>
  );
}

/** Six digits from the app */
export function CodeField({ value, onChange, error, label = "6-digit code from your app" }: { value: string; onChange: (v: string) => void; error?: string; label?: string }) {
  return (
    <TextField
      label={label}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="--- ---"
      icon={Smartphone}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
      error={error}
      autoFocus
    />
  );
}
