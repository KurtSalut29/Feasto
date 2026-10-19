import { Activity, Database, HardDrive, Inbox, Server, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Card } from "@/components/ui/card";
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
  return <span className={`inline-block size-2.5 rounded-full ${up ? "bg-emerald-500" : "bg-red-500"}`} aria-label={up ? "Up" : "Down"} />;
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{children}</p>
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

  const instanceCard = (i: Instance) => (
    <li key={i.instance} className={`rounded-2xl border p-4 ${i.online ? "border-line bg-white" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <Dot up={i.online} />
          {i.instance}
        </p>
        <span className={`text-xs font-semibold ${i.online ? "text-emerald-700" : "text-red-700"}`}>{i.online ? "Online" : "Not responding"}</span>
      </div>
      {i.online ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {i.role === "api" ? (
            <>
              <Metric label="Requests/s">{i.requestsPerSecond ?? 0}</Metric>
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
      ) : (
        <p className="mt-2 text-sm text-red-700">Last heard {formatDateTime(i.at)}. Nginx sends traffic to the other copies.</p>
      )}
    </li>
  );

  return (
    <>
      <AutoRefresh everyMs={5000} />
      <PageHeader
        title="System"
        description={`Live status, refreshed every 5 seconds. This check was answered by ${status.servedBy}.`}
      />

      <Card title="API copies" description="Nginx spreads requests across these. Stop one and the others keep serving." actions={<Server className="size-5 text-muted" aria-hidden />}>
        <ul className="grid gap-3 p-5 md:grid-cols-3">{apis.map(instanceCard)}</ul>
      </Card>

      <Card title="Workers" description="Take jobs from the queues; each handles several at once." className="mt-6" actions={<Workflow className="size-5 text-muted" aria-hidden />}>
        <ul className="grid gap-3 p-5 md:grid-cols-3">{workers.map(instanceCard)}</ul>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Message queues (RabbitMQ)" actions={<Dot up={status.rabbitmq.up} />}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Queue</th>
                <th className="px-5 py-3 text-right font-semibold">Waiting</th>
                <th className="px-5 py-3 text-right font-semibold">Workers</th>
                <th className="px-5 py-3 text-right font-semibold">Sent so far</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {status.rabbitmq.queues.map((q) => (
                <tr key={q.name}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{QUEUE_LABEL[q.name] ?? q.name}</p>
                    <p className="text-xs text-gray-400">{q.name}</p>
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold ${q.waiting > 0 ? "text-amber-700" : "text-ink"}`}>{q.waiting}</td>
                  <td className="px-5 py-3 text-right text-ink">{q.consumers}</td>
                  <td className="px-5 py-3 text-right text-muted">{q.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <Card>
            <div className="flex items-center gap-4 p-5">
              <Database className="size-6 text-muted" aria-hidden />
              <div className="flex-1">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <Dot up={status.postgres.up} /> PostgreSQL
                </p>
                <p className="text-sm text-muted">
                  {status.postgres.ms} ms · {status.postgres.connections} connections
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4 p-5">
              <HardDrive className="size-6 text-muted" aria-hidden />
              <div className="flex-1">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <Dot up={status.redis.up} /> Redis
                </p>
                <p className="text-sm text-muted">
                  {status.redis.ms} ms · {status.redis.keys} keys · {status.redis.memory}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4 p-5">
              <Inbox className="size-6 text-muted" aria-hidden />
              <div className="flex-1">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <Activity className="size-4 text-muted" aria-hidden /> Outbox
                </p>
                <p className="text-sm text-muted">{status.outboxWaiting} events waiting to be sent</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
