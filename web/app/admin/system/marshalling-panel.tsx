"use client";

import { ArrowDown, ArrowRight, ArrowUp, Binary, Braces, FileJson, Pause, Play, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/api-client";

type Transport = "rabbitmq" | "outbox" | "pubsub" | "redis" | "http";
type Step = {
  id: string;
  at: string;
  instance: string;
  step: "marshal" | "unmarshal";
  transport: Transport;
  channel: string;
  kind: string;
  messageId: string | null;
  bytes: number;
  ms: number;
  text: string;
  truncated: boolean;
};

const TRANSPORT: Record<Transport, { label: string; detail: string; tone: string }> = {
  outbox: { label: "Outbox", detail: "Saved with the order in PostgreSQL (JSON column)", tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  rabbitmq: { label: "RabbitMQ", detail: "Sent to a queue as UTF-8 bytes", tone: "bg-orange-50 text-orange-700 ring-orange-100" },
  pubsub: { label: "Live update", detail: "Redis pub/sub to open pages", tone: "bg-sky-50 text-sky-700 ring-sky-100" },
  redis: { label: "Redis", detail: "Cache, rider location and report parts", tone: "bg-red-50 text-red-700 ring-red-100" },
  http: { label: "HTTP", detail: "A browser's request body", tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
};
const TRANSPORTS = Object.keys(TRANSPORT) as Transport[];

/** How many steps the list shows before "Show more" */
const PAGE = 40;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" });

function sizeText(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** The first bytes as hex, 16 to a line: what actually travels */
function hexDump(text: string, max = 96) {
  const bytes = new TextEncoder().encode(text).slice(0, max);
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(
      Array.from(bytes.slice(i, i + 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    );
  }
  return lines.join("\n");
}

function pretty(step: Step) {
  if (step.truncated) return null;
  try {
    return JSON.stringify(JSON.parse(step.text), null, 2);
  } catch {
    return null;
  }
}

function StepBadge({ step }: { step: Step["step"] }) {
  return step === "marshal" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white">
      <ArrowUp className="size-3" aria-hidden />
      Marshal
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-line">
      <ArrowDown className="size-3" aria-hidden />
      Unmarshal
    </span>
  );
}

function TransportChip({ transport }: { transport: Transport }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${TRANSPORT[transport].tone}`}>{TRANSPORT[transport].label}</span>;
}

/**
 * Marshalling, live: every time a server turns an object into bytes to send it (marshal) or turns
 * received bytes back into an object (unmarshal), with the real data, the bytes, and which copy
 * did it. A RabbitMQ message's whole trip is linked by its message id.
 */
export function MarshallingPanel() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [live, setLive] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const result = await apiRequest<{ steps: Step[] }>("/admin/marshalling");
    if (result.ok) setSteps(result.data.steps);
  }, []);

  useEffect(() => {
    // First read once mounted, then every 2 seconds while live
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!live) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load, live]);

  async function sendSample() {
    setSending(true);
    setError(undefined);
    const result = await apiRequest<{ messageId: string }>("/admin/marshalling/sample", { method: "POST", body: {} });
    setSending(false);
    if (!result.ok) return setError(result.error);
    setTransport(null);
    setLive(true);
    // Follow the sample: choose its first step as soon as it shows up
    setSelectedId(`message:${result.data.messageId}`);
    await load();
  }

  const filtered = steps.filter((s) => !transport || s.transport === transport);
  const followMessage = selectedId?.startsWith("message:") ? selectedId.slice(8) : null;
  const selected = followMessage
    ? ([...steps].reverse().find((s) => s.messageId === followMessage) ?? null)
    : (steps.find((s) => s.id === selectedId) ?? filtered[0] ?? null);
  const trip = selected?.messageId ? steps.filter((s) => s.messageId === selected.messageId).sort((a, b) => a.at.localeCompare(b.at)) : [];

  const totals = TRANSPORTS.map((t) => {
    const of = steps.filter((s) => s.transport === t);
    return { t, marshal: of.filter((s) => s.step === "marshal").length, unmarshal: of.filter((s) => s.step === "unmarshal").length, bytes: of.reduce((n, s) => n + s.bytes, 0) };
  });

  return (
    <Card
      title="Marshalling and unmarshalling"
      description="Every time data leaves or reaches a server: the object, the bytes that travel, and which copy did it."
      Icon={Braces}
      className="mt-6"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-9 px-3 text-sm" onClick={() => setLive(!live)} aria-pressed={!live}>
            {live ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {live ? "Pause" : "Resume"}
          </Button>
          <Button className="h-9 px-3.5 text-sm" loading={sending} onClick={sendSample}>
            <Send className="size-4" aria-hidden />
            Send a sample message
          </Button>
        </div>
      }
    >
      {/* What the words mean, in one line */}
      <div className="grid items-center gap-2 border-b border-line bg-canvas/50 px-5 py-4 text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        {[
          { Icon: Braces, title: "Object", text: "In the sender's memory" },
          { arrow: "Marshal", sub: "JSON.stringify" },
          { Icon: FileJson, title: "JSON text", text: "A string anyone can read" },
          { arrow: "Encode", sub: "UTF-8" },
          { Icon: Binary, title: "Bytes", text: "What travels on the wire" },
          { arrow: "Decode", sub: "UTF-8" },
          { Icon: FileJson, title: "JSON text", text: "At the receiver" },
          { arrow: "Unmarshal", sub: "JSON.parse" },
          { Icon: Braces, title: "Object", text: "In the receiver's memory" },
        ].map((part, i) =>
          "arrow" in part ? (
            <p key={i} className="flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-brand-700 md:flex-col md:gap-0">
              <ArrowRight className="size-4 rotate-90 md:rotate-0" aria-hidden />
              {part.arrow}
              <span className="font-mono font-normal text-muted">{part.sub}</span>
            </p>
          ) : (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
              <part.Icon className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{part.title}</span>
                <span className="block text-xs text-muted">{part.text}</span>
              </span>
            </div>
          ),
        )}
      </div>

      {/* Where it happens, with how many of each in the log */}
      <div role="group" aria-label="Show" className="flex gap-2 overflow-x-auto border-b border-line px-5 py-3 [scrollbar-width:none]">
        <button
          type="button"
          aria-pressed={transport === null}
          onClick={() => setTransport(null)}
          className={`h-14 shrink-0 rounded-xl px-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-brand-500 ${transport === null ? "bg-ink text-white" : "bg-canvas text-ink hover:bg-gray-100"}`}
        >
          <span className="block font-semibold">All</span>
          <span className={`block text-xs ${transport === null ? "text-white/70" : "text-muted"}`}>{steps.length} steps</span>
        </button>
        {totals.map(({ t, marshal, unmarshal, bytes }) => (
          <button
            key={t}
            type="button"
            aria-pressed={transport === t}
            title={TRANSPORT[t].detail}
            onClick={() => setTransport(transport === t ? null : t)}
            className={`h-14 shrink-0 rounded-xl px-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-brand-500 ${transport === t ? "bg-ink text-white" : "bg-canvas text-ink hover:bg-gray-100"}`}
          >
            <span className="block font-semibold">{TRANSPORT[t].label}</span>
            <span className={`block text-xs tabular-nums ${transport === t ? "text-white/70" : "text-muted"}`}>
              ↑{marshal} ↓{unmarshal} · {sizeText(bytes)}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="border-b border-line px-5 py-2 text-sm text-red-700">{error}</p>}

      {steps.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">Nothing yet. Press Send a sample message, or use Feasto in another tab.</p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ol className="max-h-[640px] divide-y divide-line overflow-y-auto border-line lg:border-r" aria-label="Steps, newest first">
            {filtered.slice(0, shown).map((s) => {
              const on = selected?.id === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-current={on ? "true" : undefined}
                    className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-2.5 text-left transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${on ? "bg-brand-50/70" : "hover:bg-canvas/60"}`}
                  >
                    {on && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-r bg-brand-600" />}
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <StepBadge step={s.step} />
                      <TransportChip transport={s.transport} />
                      <span className="truncate text-sm font-semibold text-ink">{s.kind}</span>
                    </span>
                    <span className="text-xs text-muted tabular-nums">{clock(s.at)}</span>
                    <span className="truncate font-mono text-xs text-muted">
                      {s.instance} · {s.channel}
                    </span>
                    <span className="text-right text-xs font-medium text-ink tabular-nums">{sizeText(s.bytes)}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length > shown && (
              <li className="px-5 py-3">
                <button type="button" onClick={() => setShown(shown + PAGE)} className="text-sm font-semibold text-brand-700 hover:underline">
                  Show {Math.min(PAGE, filtered.length - shown)} more
                </button>
              </li>
            )}
          </ol>

          <div className="min-w-0 p-5">{selected ? <StepDetail step={selected} trip={trip} /> : <p className="py-10 text-center text-sm text-muted">Choose a step.</p>}</div>
        </div>
      )}
    </Card>
  );
}

/** One step: who did it, the message's whole trip when it has one, the object and the bytes. */
function StepDetail({ step, trip }: { step: Step; trip: Step[] }) {
  const object = pretty(step);
  const start = trip[0] ? new Date(trip[0].at).getTime() : 0;
  return (
    <div className="space-y-4">
      <div>
        <p className="flex flex-wrap items-center gap-1.5">
          <StepBadge step={step.step} />
          <TransportChip transport={step.transport} />
        </p>
        <p className="mt-1.5 text-lg font-semibold text-ink">{step.kind}</p>
        <p className="text-sm text-muted">
          {step.step === "marshal" ? "Turned into bytes by" : "Turned back into an object by"} <span className="font-semibold text-ink">{step.instance}</span> at {clock(step.at)} ·{" "}
          {sizeText(step.bytes)} in {step.ms} ms
        </p>
        <p className="mt-0.5 font-mono text-xs break-all text-muted">{step.channel}</p>
      </div>

      {trip.length > 1 && (
        <section aria-label="The message's trip" className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3.5">
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-brand-700 uppercase">The whole trip of this message</p>
          <ol className="space-y-1.5">
            {trip.map((t, i) => (
              <li key={t.id} className={`flex flex-wrap items-center gap-2 text-sm ${t.id === step.id ? "font-semibold" : ""}`}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                <StepBadge step={t.step} />
                <TransportChip transport={t.transport} />
                <span className="font-mono text-xs text-ink">{t.instance}</span>
                <span className="ml-auto text-xs text-muted tabular-nums">+{new Date(t.at).getTime() - start} ms</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <section aria-label="As an object">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            <Braces className="size-3.5" aria-hidden />
            Object {step.step === "marshal" ? "before" : "after"}
          </p>
          <pre className="max-h-72 overflow-auto rounded-xl bg-[#1f2d3d] p-3 font-mono text-xs leading-relaxed text-emerald-200">
            {object ?? "Too long to show in full; see the text on the right."}
          </pre>
        </section>
        <section aria-label="On the wire">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            <FileJson className="size-3.5" aria-hidden />
            JSON text on the wire
          </p>
          <pre className="max-h-40 overflow-auto rounded-xl bg-canvas p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink ring-1 ring-line">
            {step.text}
            {step.truncated && <span className="text-muted"> … ({sizeText(step.bytes)} in all)</span>}
          </pre>
        </section>
      </div>
      <section aria-label="The bytes">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
          <Binary className="size-3.5" aria-hidden />
          The first bytes, as they travel (hex: 7b is “{"{"}”, 22 is “&quot;”)
        </p>
        <pre className="overflow-x-auto rounded-xl bg-canvas p-3 font-mono text-xs leading-relaxed text-ink ring-1 ring-line">{hexDump(step.text)}</pre>
      </section>
    </div>
  );
}
