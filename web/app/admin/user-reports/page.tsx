import { Ban, Bike, CheckCheck, Flag, Inbox, Store, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { LiftSuspension, ResolveReport } from "./report-actions";

export const metadata: Metadata = { title: "User reports" };

type Role = "RESIDENT" | "RIDER" | "VENDOR";
type Person = { id: string; name: string; owner: string | null; email: string; phone: string | null; role: Role; suspendedUntil: string | null; disabled: boolean };
type Row = {
  id: string;
  reason: string;
  reasonText: string;
  details: string;
  photoUrl: string | null;
  status: "OPEN" | "DISMISSED" | "WARNED" | "SUSPENDED";
  adminNote: string | null;
  suspendedUntil: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  reporter: Person;
  reported: Person & { past: { reports: number; warnings: number; suspensions: number } };
  about: { kind: string; label: string; href: string | null };
};
type Response = {
  view: "open" | "closed";
  page: number;
  pageSize: number;
  total: number;
  open: number;
  suspendDays: number[];
  reports: Row[];
  suspended: { id: string; name: string; role: Role; until: string; untilLifted: boolean }[];
};

const ROLE: Record<Role, { label: string; Icon: typeof User }> = {
  RESIDENT: { label: "Customer", Icon: User },
  RIDER: { label: "Rider", Icon: Bike },
  VENDOR: { label: "Store", Icon: Store },
};
const OUTCOME: Record<Row["status"], { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Waiting", tone: "warning" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
  WARNED: { label: "Warned", tone: "warning" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};
const until = (iso: string, lifted: boolean) => (lifted ? "until you lift it" : `until ${formatDateTime(iso)}`);

export default function AdminUserReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const view = params.view === "closed" ? "closed" : "open";
  const page = Number(params.page) || 1;
  const data = await serverApi<Response>(`/admin/user-reports?view=${view}&page=${page}`);
  const href = (v: string, p = 1) => `/admin/user-reports?view=${v}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="User reports"
        description="Reports residents, riders and stores sent about someone on an order, Pabili or booking. Dismiss it, warn the person, or suspend them."
      />
      <div className="space-y-5">
        {data.suspended.length > 0 && (
          <Card title="Suspended now" description="They can sign in, but can't order, take jobs or get orders until it ends." Icon={Ban} accent="amber">
            <ul className="divide-y divide-line">
              {data.suspended.map((u) => {
                const { label, Icon } = ROLE[u.role];
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <Icon className="size-5 shrink-0 text-red-600" aria-hidden />
                    <p className="min-w-0 flex-1 basis-48">
                      <span className="font-semibold text-ink">{u.name}</span>
                      <span className="text-sm text-muted">
                        {" "}
                        · {label} · {until(u.until, u.untilLifted)}
                      </span>
                    </p>
                    <LiftSuspension userId={u.id} name={u.name} />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <LinkTabs
          variant="segmented"
          label="Reports"
          tabs={[
            { href: href("open"), label: "Waiting", Icon: Inbox, count: data.open, active: view === "open" },
            { href: href("closed"), label: "Handled", Icon: CheckCheck, active: view === "closed" },
          ]}
        />

        {data.reports.length === 0 ? (
          <EmptyState Icon={Flag} title={view === "open" ? "No reports waiting" : "Nothing handled yet"} text={view === "open" ? "When someone reports a problem, it shows up here." : "Reports you act on move here."} />
        ) : (
          <ul className="space-y-4">
            {data.reports.map((r) => (
              <li key={r.id}>
                <ReportCard r={r} suspendDays={data.suspendDays} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="reports" href={(p) => href(view, p)} />
      </div>
    </>
  );
}

function ReportCard({ r, suspendDays }: { r: Row; suspendDays: number[] }) {
  const reported = ROLE[r.reported.role];
  const reporter = ROLE[r.reporter.role];
  const outcome = OUTCOME[r.status];
  const { past } = r.reported;
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <Badge tone="danger">{r.reasonText}</Badge>
        <Badge tone={outcome.tone}>{outcome.label}</Badge>
        <span className="ml-auto text-sm text-muted">{timeAgo(r.createdAt)}</span>
      </header>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Reported</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-semibold text-ink">
              <reported.Icon className="size-4 text-brand-600" aria-hidden />
              {r.reported.name}
              <span className="text-sm font-normal text-muted">
                {reported.label}
                {r.reported.owner && ` · owner ${r.reported.owner}`}
              </span>
            </p>
            <p className="text-sm text-muted">
              {[r.reported.email, r.reported.phone].filter(Boolean).join(" · ")}
            </p>
            <p className={`mt-1 text-sm ${past.reports > 1 ? "font-semibold text-red-700" : "text-muted"}`}>
              {past.reports} {past.reports === 1 ? "report" : "reports"} in all · {past.warnings} {past.warnings === 1 ? "warning" : "warnings"} · {past.suspensions}{" "}
              {past.suspensions === 1 ? "suspension" : "suspensions"}
              {r.reported.suspendedUntil && " · suspended now"}
              {r.reported.disabled && " · account disabled"}
            </p>
          </div>
          <blockquote className="rounded-xl bg-canvas px-4 py-3 text-[0.9375rem] whitespace-pre-line text-ink">{r.details}</blockquote>
          <p className="text-sm text-muted">
            From <span className="font-semibold text-ink">{r.reporter.name}</span> ({reporter.label.toLowerCase()}) about{" "}
            {r.about.href ? (
              <Link href={r.about.href} className="font-semibold text-brand-700 hover:underline">
                {r.about.label}
              </Link>
            ) : (
              <span className="font-semibold text-ink">{r.about.label}</span>
            )}
          </p>
        </div>
        {r.photoUrl && (
          <a href={r.photoUrl} target="_blank" rel="noreferrer" className="block self-start overflow-hidden rounded-xl bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.photoUrl} alt="Photo sent with the report" className="max-h-56 w-full object-cover" />
          </a>
        )}
      </div>
      <footer className="border-t border-line bg-canvas/40 px-5 py-3">
        {r.status === "OPEN" ? (
          <ResolveReport id={r.id} name={r.reported.name} suspendDays={suspendDays} />
        ) : (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{outcome.label}</span>
            {r.status === "SUSPENDED" && r.suspendedUntil && ` ${until(r.suspendedUntil, new Date(r.suspendedUntil).getUTCFullYear() >= 2999)}`}
            {r.resolvedByName && ` by ${r.resolvedByName}`}
            {r.resolvedAt && `, ${formatDateTime(r.resolvedAt)}`}
            {r.adminNote && <span className="mt-1 block text-ink">“{r.adminNote}”</span>}
          </p>
        )}
      </footer>
    </article>
  );
}
