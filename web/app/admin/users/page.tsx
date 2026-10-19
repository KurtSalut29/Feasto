import { Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ApprovalBadge } from "@/components/app/status-badges";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDate, initials } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/roles";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus, Role, VehicleType } from "@/lib/types";

export const metadata: Metadata = { title: "Users" };

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: string;
  vendor: { name: string; status: ApprovalStatus } | null;
  riderProfile: { vehicleType: VehicleType; status: ApprovalStatus } | null;
};
type UsersResponse = { users: UserRow[]; page: number; pageSize: number; total: number; counts: Partial<Record<Role, number>> };

const ROLES: Role[] = ["RESIDENT", "RIDER", "VENDOR", "ADMIN"];
const ROLE_TONE: Record<Role, BadgeTone> = { RESIDENT: "neutral", RIDER: "brand", VENDOR: "success", ADMIN: "warning" };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <UsersList searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersList({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const role = ROLES.find((r) => r === params.role);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);

  const query = new URLSearchParams({ page: String(page), ...(role && { role }), ...(q && { q }) });
  const data = await serverApi<UsersResponse>(`/admin/users?${query}`);
  const all = Object.values(data.counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ ...(role && { role }), ...(q && { q }) });
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const s = next.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader title="Users" description="Everyone with a Feasto account." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <LinkTabs
          variant="pills"
          tabs={[
            { href: href({ role: undefined, page: undefined }), label: "All", count: all, active: !role },
            ...ROLES.map((r) => ({
              href: href({ role: r, page: undefined }),
              label: `${ROLE_LABEL[r]}s`,
              count: data.counts[r] ?? 0,
              active: role === r,
            })),
          ]}
        />
        <form action="/admin/users" className="relative w-full sm:w-72">
          {role && <input type="hidden" name="role" value={role} />}
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, email, phone, store"
            aria-label="Search users"
            className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </form>
      </div>

      <Card>
        {data.users.length === 0 ? (
          <EmptyState Icon={Users} title="No users found" text={q ? `Nobody matches “${q}”.` : "No accounts in this group yet."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Store / vehicle</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-semibold text-muted">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{user.name}</p>
                          <p className="truncate text-muted">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{user.phone ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {user.vendor ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ink">{user.vendor.name}</span>
                          <ApprovalBadge status={user.vendor.status} />
                        </div>
                      ) : user.riderProfile ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ink">{VEHICLE_LABEL[user.riderProfile.vehicleType]}</span>
                          <ApprovalBadge status={user.riderProfile.status} />
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <p className="text-muted">
              Page {page} of {lastPage} · {data.total} users
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">
                  Previous
                </Link>
              )}
              {page < lastPage && (
                <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
