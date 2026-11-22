"use client";

import { Camera, CircleCheck, IdCard, ImageUp, QrCode, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";

type Match = { nameMatches: boolean; birthDateMatches: boolean | null; birthDateOnQr: boolean; signed: boolean; everify: boolean | null };
type State = { idType: string | null; idStatus: "PENDING" | "VERIFIED" | "REJECTED" | null; philsysQrAt: string | null; philsysMatch: Match | null; philsysVerifiedAt: string | null; everify: boolean };

/** The browser's own QR reader (Chrome and Android); others paste the QR's text instead */
type Detector = { detect: (source: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };
const makeDetector = (): Detector | null => {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
};

/**
 * The PhilSys QR check (Level 2): scan the QR on the National ID or ePhilID. Feasto compares its name
 * and birthday with the account and keeps only a coded form of the card number. The admin still
 * decides; PhilSys's own eVerify confirms it once Feasto is approved to use it.
 */
export function PhilsysCheck() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<State>("/philsys", reload);
  const [scanning, setScanning] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Known only in the browser (false while the page is drawn on the server)
  const canScan = useSyncExternalStore(
    () => () => {},
    () => makeDetector() !== null,
    () => false,
  );

  async function send(qr: string) {
    setBusy(true);
    setError(undefined);
    const r = await apiRequest<{ match: Match }>("/philsys/qr", { method: "POST", body: { text: qr } });
    setBusy(false);
    if (!r.ok) return setError(r.fieldErrors?.text?.[0] ?? r.error);
    setPasting(false);
    setText("");
    toast.success("QR read", r.data.match.nameMatches ? "The name matches your account." : "The name is different from your account. The admin will look.");
    setReload((n) => n + 1);
  }

  async function fromPhoto(file: File) {
    const detector = makeDetector();
    if (!detector) return;
    try {
      const found = await detector.detect(await createImageBitmap(file));
      if (found[0]) await send(found[0].rawValue);
      else setError("No QR found in that photo. Take it closer, with the whole QR in the frame.");
    } catch {
      setError("That photo couldn't be read. Try again, or paste the QR's text.");
    }
  }

  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-canvas" />;
  const m = data.philsysMatch;

  return (
    <section aria-labelledby="philsys" className="rounded-3xl border border-line bg-white p-5">
      <h2 id="philsys" className="flex items-center gap-2 font-semibold text-ink">
        <QrCode className="size-5 text-brand-600" aria-hidden />
        PhilSys QR check
      </h2>
      <p className="mt-1 text-sm text-muted">
        Scan the QR on the back of your National ID (PhilID), or on your ePhilID. Feasto compares its name and birthday with your account and keeps only a coded form of the card number, never the number
        itself.
      </p>

      {m && (
        <div className={`mt-3 rounded-2xl px-4 py-3 text-sm ${m.nameMatches && m.birthDateMatches !== false ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <p className="flex items-center gap-2 font-semibold">
            {m.nameMatches && m.birthDateMatches !== false ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {m.nameMatches ? "The name on your National ID matches your account." : "The name on your National ID is different from your account."}
          </p>
          {m.birthDateMatches !== null && <p className="mt-1">{m.birthDateMatches ? "The birthday matches too." : "The birthday is different from the one on your account."}</p>}
          <p className="mt-1 flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {data.philsysVerifiedAt ? "Confirmed by PhilSys." : "The admin uses this with your ID photo. Confirming with PhilSys itself (eVerify) comes once Feasto is approved."}
          </p>
        </div>
      )}

      {scanning && <LiveScan onFound={(v) => (setScanning(false), void send(v))} onClose={() => setScanning(false)} />}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!scanning && (
        <div className="mt-4 space-y-2">
          {canScan ? (
            <>
              <Button className="w-full" onClick={() => setScanning(true)} loading={busy}>
                <Camera className="size-4" aria-hidden />
                {m ? "Scan again" : "Scan the QR"}
              </Button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500">
                <ImageUp className="size-4" aria-hidden />
                Use a photo of the QR
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void fromPhoto(e.target.files[0])} />
              </label>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted">
              <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden />
              This browser can&apos;t read QR codes. Open Feasto in Chrome, or scan the QR with your phone&apos;s camera app, copy its text and paste it below.
            </p>
          )}
          {pasting || !canScan ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
              className="space-y-2"
            >
              <TextareaField label="The QR's text" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder='{"DateIssued": … }' />
              <Button type="submit" variant="secondary" className="w-full" loading={busy} disabled={text.trim().length < 10}>
                Check it
              </Button>
            </form>
          ) : (
            <button type="button" className="tap w-full text-center text-sm font-semibold text-brand-700 hover:underline" onClick={() => setPasting(true)}>
              Paste the QR&apos;s text instead
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** The camera, reading QR codes until it finds one */
function LiveScan({ onFound, onClose }: { onFound: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string>();
  // The latest callback, so a re-render doesn't restart the camera
  const found = useRef(onFound);
  useEffect(() => {
    found.current = onFound;
  });
  useEffect(() => {
    const detector = makeDetector();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        timer = setInterval(async () => {
          if (done || !detector || !video.current || video.current.readyState < 2) return;
          const hits = await detector.detect(video.current).catch(() => []);
          if (hits[0] && !done) {
            done = true;
            found.current(hits[0].rawValue);
          }
        }, 300);
      })
      .catch(() => setProblem("The camera is blocked. Allow it in your browser, or use a photo of the QR."));
    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl bg-ink">
      <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera: point it at the QR" />
      <span aria-hidden className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/80" />
      <button type="button" onClick={onClose} className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink" aria-label="Stop scanning">
        <X className="size-5" aria-hidden />
      </button>
      <p className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-center text-sm text-white" role="status">
        {problem ?? "Point the camera at the QR on the back of your ID"}
      </p>
    </div>
  );
}
