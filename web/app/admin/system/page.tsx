import { ArrowRight, CircleAlert, CircleCheck, Database, HardDrive, Inbox, Network, Server, Workflow, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Card } from "@/components/ui/card";
import { TABLE, TBODY, TD, TH, THEAD } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

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
};
type SystemStatus = {
  servedBy: string;
  checkedAt: string;
  instances: Instance[];
  rabbitmq: { up: boolean; queues: { name: string; waiting: number; consumers: number; published: number }[] };
  postgres: { up: boolean; ms: number | null; connections: number | null };
  redis: { up: boolean; ms: number | null; keys?: number; memory?: string };
  outboxWaiting: number;
};

const QUEUE_LABEL: Record<string, string> = {
  "orders.placed": "Orders to notify stores",
  "payment.requested": "Online payments",
  "report.requested": "Report requests",
  "report.part": "Report store jobs",
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
      <p className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-ink tabular-nums">{children}</p>
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

  const instanceCard = (i: Instance) => {
    const load = i.role === "worker" && i.parallelJobs ? (i.busyJobs ?? 0) / i.parallelJobs : null;
    return (
      <li key={i.instance} className={`rounded-2xl border p-4 ${i.online ? "border-line bg-white" : "border-red-200 bg-red-50"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 font-semibold text-ink">
            <Dot up={i.online} />
            {i.instance}
            {i.instance === status.servedBy && (
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">answered this check</span>
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
                  <Metric label="Busy jobs">
                    {i.busyJobs ?? 0} / {i.parallelJobs ?? 0}
                  </Metric>
                  <Metric label="Up for">{uptime(i.startedAt, i.at)}</Metric>
                </>
              )}
              <Metric label="Memory">{i.memoryMb} MB</Metric>
            </div>
            {load !== null && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden>
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${load * 100}%` }} />
              </div>
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
      <PageHeader title="System" description="Live status of every server, refreshed every 5 seconds." />

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
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-400 md:rotate-0" aria-hidden />
          <FlowNode Icon={Server} name={`API × ${apis.length}`} detail={`${apisUp} of ${apis.length} online`} up={apisUp === apis.length} />
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-400 md:rotate-0" aria-hidden />
          <FlowNode Icon={Inbox} name="RabbitMQ" detail={`${status.rabbitmq.queues.length} queues`} up={status.rabbitmq.up} />
          <ArrowRight className="mx-auto size-4 rotate-90 text-gray-400 md:rotate-0" aria-hidden />
          <FlowNode Icon={Workflow} name={`Workers × ${workers.length}`} detail={`${workersUp} of ${workers.length} online`} up={workersUp === workers.length} />
        </div>
      </section>

      <Card title="API copies" description="Nginx spreads requests across these. Stop one and the others keep serving." Icon={Server}>
        <ul className="grid gap-3 p-5 md:grid-cols-3">{apis.map(instanceCard)}</ul>
      </Card>

      <Card title="Workers" description="Take jobs from the queues; each handles several at once." Icon={Workflow} className="mt-6">
        <ul className="grid gap-3 p-5 md:grid-cols-3">{workers.map(instanceCard)}</ul>
      </Card>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Message queues" description="RabbitMQ" Icon={Inbox} actions={<Dot up={status.rabbitmq.up} />}>
          <div className="overflow-x-auto">
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
                      <p className="font-mono text-xs text-gray-400">{q.name}</p>
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

        <Card title="Data services" Icon={Database}>
          <ul className="divide-y divide-line">
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
              <li key={name} className="flex items-start gap-3 px-5 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted ring-1 ring-line/70">
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
    </>
  );
}
