import { ArrowRight, CircleAlert, CircleCheck, Database, HardDrive, Inbox, Network, Server, Workflow, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Card } from "@/components/ui/card";
import { TABLE, TBODY, TD, TH, THEAD } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { JoinQr } from "./join-qr";
import { MarshallingPanel } from "./marshalling-panel";

export const metadata: Metadata = { title: "System" };

type Instance = {
  instance: string;
  role: "api" | "worker";
  online: boolean;
  startedAt: string;
  at: string;
  memoryMb: number;
  requests?: number;
  requestsPerSecond?: number;
  liveConnections?: number;
  busyJobs?: number;
  parallelJobs?: number;
  /** How many workers were started, and on how many CPUs */
  workerCount?: number;
  cpuCount?: number;
  /** Jobs this worker finished since it started, and how many were a store's share of a sales report */
  jobsDone?: number;
  reportParts?: number;
};
type LastReport = { id: string; from: string; to: string; finishedAt: string | null; durationMs: number | null; stores: number; byWorker: Record<string, number> };
type SystemStatus = {
  servedBy: string;
  checkedAt: string;
  instances: Instance[];
  rabbitmq: { up: boolean; queues: { name: string; waiting: number; consumers: number; published: number }[] };
  postgres: { up: boolean; ms: number | null; connections: number | null };
  redis: { up: boolean; ms: number | null; keys?: number; memory?: string };
  outboxWaiting: number;
  lastReport: LastReport | null;
};

const QUEUE_LABEL: Record<string, string> = {
  "orders.placed": "Orders to notify stores",
  "payment.requested": "Online payments",
  "report.requested": "Report requests",
  "report.part": "Report store jobs",
  "system.sample": "Sample messages",
};

export default function AdminSystemPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SystemMonitor />
    </Suspense>
  );
}

function Dot({ up }: { up: boolean }) {
  return (
    <span className="relative inline-flex size-2.5 shrink-0" role="img" aria-label={up ? "Up" : "Down"}>
      {up && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />}
      <span className={`relative inline-block size-2.5 rounded-full ${up ? "bg-emerald-500" : "bg-red-500"}`} />
    </span>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] font-medium tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="mt-0.5 text-[0.9375rem] font-semibold text-ink tabular-nums">{children}</p>
    </div>
  );
}

/** One box in the request-flow strip: a service and how many of its copies are up. */
function FlowNode({ Icon, name, detail, up }: { Icon: LucideIcon; name: string; detail: string; up: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 ${up ? "border-line" : "border-red-200 bg-red-50"}`}>
      <Icon className={`size-5 shrink-0 ${up ? "text-brand-600" : "text-red-600"}`} aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Who computed the newest sales report: stores per worker, from the report's own rows. "Busy now"
 * above is only a moment's look and a report takes about a second, so this is the record.
 */
function LastReportSplit({ report, workers }: { report: LastReport; workers: string[] }) {
  const names = [...new Set([...workers, ...Object.keys(report.byWorker)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const most = Math.max(1, ...Object.values(report.byWorker));
  const seconds = report.durationMs === null ? null : (report.durationMs / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 });
  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">Last sales report: who computed each store</p>
        <Link href={`/admin/reports?id=${report.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
          Open the report
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {formatShortDate(report.from)} to {formatShortDate(report.to)} · {report.stores} stores{seconds ? ` in ${seconds} s` : ""}. Same as the report&apos;s Computed by column.
      </p>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {names.map((name) => {
          const count = report.byWorker[name] ?? 0;
          return (
            <li key={name} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 font-medium text-ink">{name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(count / most) * 100}%` }} />
              </span>
              <span className="w-16 shrink-0 text-right text-muted tabular-nums">
                {count} {count === 1 ? "store" : "stores"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatShortDate(day: string) {
  return new Date(`${day}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

function uptime(startedAt: string, at: string) {
  const s = Math.max(0, Math.round((new Date(at).getTime() - new Date(startedAt).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

async function SystemMonitor() {
  await requireRole("ADMIN");
  const status = await serverApi<SystemStatus>("/admin/system");
  const apis = status.instances.filter((i) => i.role === "api");
  const workers = status.instances.filter((i) => i.role === "worker");
  const apisUp = apis.filter((i) => i.online).length;
  const workersUp = workers.filter((i) => i.online).length;
  const services = [status.rabbitmq.up, status.postgres.up, status.redis.up];
  const problems = apis.length - apisUp + (workers.length - workersUp) + services.filter((up) => !up).length;
  const waiting = status.rabbitmq.queues.reduce((n, q) => n + q.waiting, 0);
  const cpus = workers.find((w) => w.online && w.cpuCount)?.cpuCount;
  const workersNote = cpus
    ? `One worker per CPU: the server has ${cpus} ${cpus === 1 ? "CPU" : "CPUs"}, so ${workers.find((w) => w.online)?.workerCount ?? workers.length} workers started. Each takes jobs from the queues and handles up to ${workers[0]?.parallelJobs ?? 5} at once.`
    : "Take jobs from the queues; each handles several at once.";

  const instanceCard = (i: Instance) => {
    const load = i.role === "worker" && i.parallelJobs ? (i.busyJobs ?? 0) / i.parallelJobs : null;
    return (
      <li key={i.instance} className={`rounded-2xl border p-4 ${i.online ? "border-line bg-white" : "border-red-200 bg-red-50"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 font-semibold text-ink">
            <Dot up={i.online} />
            {i.instance}
            {i.instance === status.servedBy && (
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-700">answered this check</span>
            )}
          </p>
          <span className={`text-xs font-semibold ${i.online ? "text-emerald-700" : "text-red-700"}`}>{i.online ? "Online" : "Not responding"}</span>
        </div>
        {i.online ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {i.role === "api" ? (
                <>
                  <Metric label="Req / s">{i.requestsPerSecond ?? 0}</Metric>
                  <Metric label="Live users">{i.liveConnections ?? 0}</Metric>
                </>
              ) : (
                <>
                  <Metric label="Busy now">
                    {i.busyJobs ?? 0} / {i.parallelJobs ?? 0}
                  </Metric>
                  <Metric label="Jobs done">{(i.jobsDone ?? 0).toLocaleString("en-PH")}</Metric>
                </>
              )}
              <Metric label="Memory">{i.memoryMb} MB</Metric>
            </div>
            {load !== null && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${load * 100}%` }} />
              </div>
            )}
            {i.role === "worker" && (
              <p className="mt-2.5 text-xs text-muted">
                Up for {uptime(i.startedAt, i.at)} · {i.reportParts ?? 0} report {i.reportParts === 1 ? "store" : "stores"} computed
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-red-700">Last heard {formatDateTime(i.at)}. Nginx sends traffic to the other copies.</p>
        )}
      </li>
    );
  };

  return (
    <>
      <AutoRefresh everyMs={5000} />
      <PageHeader eyebrow="Insights" title="System" description="Live status of every server, and every message they marshal and unmarshal." />
      <JoinQr />

      <section
        aria-label="Overall status"
        className={`mb-6 rounded-2xl border p-5 ${problems ? "border-red-200 bg-gradient-to-br from-red-50 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {problems ? <CircleAlert className="size-7 text-red-600" aria-hidden /> : <CircleCheck className="size-7 text-emerald-600" aria-hidden />}
            <div>
              <p className="text-lg font-semibold text-ink">{problems ? `${problems} ${problems === 1 ? "service needs" : "services need"} attention` : "All systems running"}</p>
              <p className="text-sm text-muted">
                Answered by <span className="font-medium text-ink">{status.servedBy}</span> · {waiting} {waiting === 1 ? "job" : "jobs"} waiting in the queues
              </p>
            </div>
          </div>
        </div>

        {/* How a request travels through Feasto */}
        <div className="mt-5 grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <FlowNode Icon={Network} name="Nginx" detail="Load balancer" up={apisUp > 0} />
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-500 md:rotate-0" aria-hidden />
          <FlowNode Icon={Server} name={`API × ${apis.length}`} detail={`${apisUp} of ${apis.length} online`} up={apisUp === apis.length} />
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-500 md:rotate-0" aria-hidden />
          <FlowNode Icon={Inbox} name="RabbitMQ" detail={`${status.rabbitmq.queues.length} queues`} up={status.rabbitmq.up} />
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-500 md:rotate-0" aria-hidden />
          <FlowNode
            Icon={Workflow}
            name={`Workers × ${workers.length}`}
            detail={`${workersUp} of ${workers.length} online${cpus ? ` · ${cpus} CPUs` : ""}`}
            up={workersUp === workers.length}
          />
        </div>
      </section>

      <Card title="API copies" description="Nginx spreads requests across these. Stop one and the others keep serving." Icon={Server}>
        <ul className="grid gap-3 p-5 md:grid-cols-3">{apis.map(instanceCard)}</ul>
      </Card>

      <Card title="Workers" description={workersNote} Icon={Workflow} className="mt-6">
        <ul className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">{workers.map(instanceCard)}</ul>
        {status.lastReport && <LastReportSplit report={status.lastReport} workers={workers.map((w) => w.instance)} />}
      </Card>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-stretch">
        <Card title="Message queues" description="RabbitMQ" Icon={Inbox} actions={<Dot up={status.rabbitmq.up} />}>
          <div tabIndex={0} role="region" aria-label="Processes" className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Queue</th>
                  <th className={`${TH} text-right`}>Waiting</th>
                  <th className={`${TH} text-right`}>Workers</th>
                  <th className={`${TH} text-right`}>Sent so far</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {status.rabbitmq.queues.map((q) => (
                  <tr key={q.name}>
                    <td className={TD}>
                      <p className="font-medium text-ink">{QUEUE_LABEL[q.name] ?? q.name}</p>
                      <p className="font-mono text-xs text-gray-500">{q.name}</p>
                    </td>
                    <td className={`${TD} text-right font-semibold tabular-nums ${q.waiting > 0 ? "text-amber-700" : "text-ink"}`}>{q.waiting}</td>
                    <td className={`${TD} text-right text-ink tabular-nums`}>{q.consumers}</td>
                    <td className={`${TD} text-right text-muted tabular-nums`}>{q.published}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* As tall as the queues beside it: the three rows share the height */}
        <Card title="Data services" Icon={Database}>
          <ul className="flex flex-1 flex-col divide-y divide-line">
            {[
              {
                Icon: Database,
                name: "PostgreSQL",
                role: "Main database",
                up: status.postgres.up,
                stats: [`${status.postgres.ms} ms`, `${status.postgres.connections} connections`],
              },
              {
                Icon: HardDrive,
                name: "Redis",
                role: "Cache, sessions and live updates",
                up: status.redis.up,
                stats: [`${status.redis.ms} ms`, `${status.redis.keys} keys`, `${status.redis.memory}`],
              },
              {
                Icon: Inbox,
                name: "Outbox",
                role: "Events saved with each order, then sent",
                up: status.outboxWaiting < 50,
                stats: [`${status.outboxWaiting} waiting to be sent`],
              },
            ].map(({ Icon, name, role, up, stats }) => (
              <li key={name} className="flex flex-1 items-center gap-3 px-5 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    {name} <Dot up={up} />
                  </p>
                  <p className="text-xs text-muted">{role}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {stats.map((s) => (
                      <span key={s} className="rounded-md bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink tabular-nums">
                        {s}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MarshallingPanel />
    </>
  );
}
