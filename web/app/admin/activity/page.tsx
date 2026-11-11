import { History } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Pagination } from "@/components/ui/pagination";
import { SearchBox } from "@/components/ui/search-box";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Activity log" };

const CATEGORIES = {
  APPROVALS: { label: "Approvals", tone: "success" },
  DOCUMENTS: { label: "Documents", tone: "info" },
  ACCOUNTS: { label: "Accounts", tone: "warning" },
  ORDERS: { label: "Orders", tone: "brand" },
  SETTINGS: { label: "Settings", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;
type Category = keyof typeof CATEGORIES;

type Entry = { id: string; actorName: string; category: Category; action: string; target: string; detail: string | null; createdAt: string };
type Response = { entries: Entry[]; page: number; pageSize: number; total: number };

export default function AdminActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}

async function Activity({ searchParams }: Pick<PageProps<"/admin/activity">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const category = (Object.keys(CATEGORIES) as Category[]).find((c) => c === params.category);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const query = new URLSearchParams({ page: String(page), ...(category && { category }), ...(q && { q }) });
  const data = await serverApi<Response>(`/admin/activity?${query}`);
  const href = (changes: { category?: Category | null; page?: number; q?: string | null }) => {
    const next = new URLSearchParams();
    const c = changes.category === undefined ? category : changes.category;
    const search = changes.q === undefined ? q : changes.q;
    if (c) next.set("category", c);
    if (search) next.set("q", search);
    if (changes.page && changes.page > 1) next.set("page", String(changes.page));
    const text = next.toString();
    return `/admin/activity${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader eyebrow="Insights" title="Activity log" description="Who did what on Feasto, when and why. Lines are only ever added, never changed." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs
          variant="pills"
          label="Kind of activity"
          tabs={[
            { href: href({ category: null, page: 1 }), label: "All", active: !category },
            ...(Object.keys(CATEGORIES) as Category[]).map((c) => ({ href: href({ category: c, page: 1 }), label: CATEGORIES[c].label, active: c === category })),
          ]}
        />
        <SearchBox action="/admin/activity" value={q} placeholder="Name, action or reason" label="Search the activity log" keep={category ? { category } : {}} clearHref={href({ q: null, page: 1 })} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {data.entries.length === 0 ? (
          <EmptyState Icon={History} title="Nothing found" text={q ? `Nothing matches “${q}”.` : "Reviews, suspensions, cancellations and setting changes will appear here."} />
        ) : (
          <>
          {/* Phones: one card per line of the log */}
          <ul className="divide-y divide-line md:hidden">
            {data.entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-ink">{entry.action}</p>
                  <Badge tone={CATEGORIES[entry.category].tone}>{CATEGORIES[entry.category].label}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-ink">{entry.target}</p>
                {entry.detail && <p className="mt-0.5 text-sm text-muted">{entry.detail}</p>}
                <p className="mt-1 text-xs text-gray-500">
                  {entry.actorName} · {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className={`${TABLE} min-w-[820px]`}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>When</th>
                  <th className={TH}>Who</th>
                  <th className={TH}>What</th>
                  <th className={TH}>About</th>
                  <th className={TH}>Details</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {data.entries.map((entry) => (
                  <tr key={entry.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap text-muted`}>{formatDateTime(entry.createdAt)}</td>
                    <td className={`${TD} text-ink`}>{entry.actorName}</td>
                    <td className={TD}>
                      <p className="font-medium text-ink">{entry.action}</p>
                      <Badge tone={CATEGORIES[entry.category].tone}>{CATEGORIES[entry.category].label}</Badge>
                    </td>
                    <td className={`${TD} text-ink`}>{entry.target}</td>
                    <td className={`${TD} max-w-xs min-w-52 whitespace-normal text-muted`}>{entry.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Pagination page={page} pageSize={data.pageSize} total={data.total} noun="lines" href={(n) => href({ page: n })} />
      </section>
    </>
  );
}
