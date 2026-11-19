import { QrCode, Wifi } from "lucide-react";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { JoinQrActions } from "./join-qr-actions";

/**
 * The address phones open, as a QR code to scan instead of typing or pasting the link. It comes
 * from infra/lan/start.ps1 (SITE_ADDRESS, and the Wi-Fi's name in LAN_WIFI): run it on another
 * Wi-Fi and the laptop gets a new address, the web app restarts with it, and this code changes
 * with it. Without start.ps1 (the cloud, or a tunnel) it's the address this page was opened on.
 */
export async function JoinQr() {
  const site = process.env.SITE_ADDRESS?.trim();
  const wifi = process.env.LAN_WIFI?.trim();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const local = !host || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host);
  const url = site ? `https://${site}` : !local ? `${proto}://${host}` : null;

  if (!url) {
    return (
      <Card title="Open Feasto on phones" Icon={QrCode} className="mb-6">
        <p className="px-5 py-4 text-sm text-muted">
          Run <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">.\infra\lan\start.ps1</code> on this laptop, and the QR code for the Wi-Fi address shows up here.
        </p>
      </Card>
    );
  }

  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1f2937", light: "#ffffff" } });
  return (
    <Card title="Open Feasto on phones" description="Scan with the phone's camera. It must be on the same Wi-Fi as this laptop." Icon={QrCode} className="mb-6">
      <div className="flex flex-col items-center gap-5 px-5 py-5 sm:flex-row sm:items-center">
        {/* Generated here from the address, so the markup is ours */}
        <div className="size-44 shrink-0 rounded-2xl border border-line bg-white p-2 [&>svg]:size-full" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Address</p>
          <p className="mt-0.5 font-mono text-[0.9375rem] font-semibold break-all text-ink">{url}</p>
          {wifi && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
              <Wifi className="size-4 text-brand-600" aria-hidden />
              Wi-Fi: <span className="font-semibold text-ink">{wifi}</span>
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            {site
              ? "Changes by itself when you move to another Wi-Fi and run .\\infra\\lan\\start.ps1 again."
              : "The address this page is open on."}
          </p>
          <JoinQrActions url={url} svg={svg} />
        </div>
      </div>
    </Card>
  );
}
