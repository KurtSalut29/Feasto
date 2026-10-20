import { Bike, ShieldCheck, Store, User, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { Pagination } from "@/components/ui/pagination";
import { SearchBox } from "@/components/ui/search-box";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/roles";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus, Role, VehicleType } from "@/lib/types";
import { AccountStatusButton } from "./account-status-button";

export const metadata: Metadata = { title: "Users" };

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: string;
  disabledAt: string | null;
  vendor: { name: string; status: ApprovalStatus } | null;
  riderProfile: { vehicleType: VehicleType; status: ApprovalStatus } | null;
};
type UsersResponse = { users: UserRow[]; page: number; pageSize: number; total: number; counts: Partial<Record<Role, number>> };

const ROLES: Role[] = ["RESIDENT", "RIDER", "VENDOR", "ADMIN"];
const ROLE_STYLE: Record<Role, { Icon: LucideIcon; className: string }> = {
  RESIDENT: { Icon: User, className: "bg-gray-100 text-gray-700" },
  RIDER: { Icon: Bike, className: "bg-sky-50 text-sky-700" },
  VENDOR: { Icon: Store, className: "bg-brand-50 text-brand-700" },
  ADMIN: { Icon: ShieldCheck, className: "bg-violet-50 text-violet-700" },
};
const APPROVAL: Record<ApprovalStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <UsersList searchParams={searchParams} />
    </Suspense>
  );
}

function RoleChip({ role }: { role: Role }) {
  const { Icon, className } = ROLE_STYLE[role];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {ROLE_LABEL[role]}
    </span>
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

  return (
    <>
      <PageHeader title="Users" description={`Everyone with a Feasto account · ${all} in total.`} />

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <LinkTabs
            variant="segmented"
            label="Role"
            tabs={[
              { href: href({ role: undefined, page: undefined }), label: "All", count: all, active: !role },
              ...ROLES.map((r) => ({ href: href({ role: r, page: undefined }), label: `${ROLE_LABEL[r]}s`, count: data.counts[r] ?? 0, active: role === r })),
            ]}
          />
          <SearchBox
            action="/admin/users"
            value={q}
            placeholder="Name, email, phone or store"
            label="Search users"
            keep={{ role }}
            clearHref={href({ q: undefined, page: undefined })}
          />
        </div>

        {data.users.length === 0 ? (
          <EmptyState Icon={Users} title="No users found" text={q ? `Nobody matches “${q}”.` : "No accounts in this group yet."} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${TABLE} min-w-[760px]`}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>User</th>
                  <th className={TH}>Role</th>
                  <th className={`${TH} hidden 2xl:table-cell`}>Phone</th>
                  <th className={TH}>Store / vehicle</th>
                  <th className={TH}>Joined</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {data.users.map((user) => {
                  const disabled = Boolean(user.disabledAt);
                  const review = user.vendor ?? user.riderProfile;
                  return (
                    <tr key={user.id} className={disabled ? "bg-canvas/60" : TR}>
                      <td className={TD}>
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} muted={disabled} />
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${disabled ? "text-muted" : "text-ink"}`}>{user.name}</p>
                            <p className="truncate text-xs text-muted">
                              {user.email}
                              {user.phone && <span className="2xl:hidden"> · {user.phone}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={TD}>
                        <RoleChip role={user.role} />
                      </td>
                      <td className={`${TD} hidden text-muted tabular-nums 2xl:table-cell`}>{user.phone ?? "—"}</td>
                      <td className={TD}>
                        {review ? (
                          <div className="min-w-0">
                            <p className="truncate text-ink">{user.vendor ? user.vendor.name : VEHICLE_LABEL[user.riderProfile!.vehicleType]}</p>
                            <p className={`text-xs font-medium ${review.status === "APPROVED" ? "text-emerald-700" : review.status === "PENDING" ? "text-amber-700" : "text-red-700"}`}>
                              {APPROVAL[review.status].label}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-muted`}>{formatDate(user.createdAt)}</td>
                      <td className={TD}>
                        {disabled ? (
                          <Badge tone="danger" dot>
                            Disabled
                          </Badge>
                        ) : (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        {user.role !== "ADMIN" && <AccountStatusButton userId={user.id} name={user.name} disabled={disabled} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={data.pageSize} total={data.total} noun="users" href={(n) => href({ page: n > 1 ? String(n) : undefined })} />
      </section>
    </>
  );
}
