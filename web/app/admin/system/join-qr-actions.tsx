"use client";

import { Check, Copy, Download, Maximize2 } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const pill =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";

/** Copy the link, show the code big (for a projector), or save it to print */
export function JoinQrActions({ url, svg }: { url: string; svg: string }) {
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy", "Select the address and copy it instead.");
    }
  }

  function download() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    link.download = `feasto-${new URL(url).hostname}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
        <button type="button" onClick={copy} className={pill}>
          {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4 text-brand-600" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button type="button" onClick={() => setBig(true)} className={pill}>
          <Maximize2 className="size-4 text-brand-600" aria-hidden />
          Show big
        </button>
        <button type="button" onClick={download} className={pill}>
          <Download className="size-4 text-brand-600" aria-hidden />
          Save QR
        </button>
      </div>
      <Dialog open={big} onClose={() => setBig(false)} title="Scan to open Feasto" description="Same Wi-Fi as this laptop, then open the camera and point it here." wide>
        <div className="flex flex-col items-center gap-4 pb-2">
          <div className="aspect-square w-full max-w-[26rem] rounded-2xl border border-line bg-white p-3 [&>svg]:size-full" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="font-mono text-lg font-semibold break-all text-ink">{url}</p>
        </div>
      </Dialog>
    </>
  );
}
