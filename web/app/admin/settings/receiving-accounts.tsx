"use client";

import { Landmark, Pencil, Plus, QrCode, Send, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountCard } from "@/components/app/pay-card-face";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import type { ReceivingAccount } from "@/lib/types";

export type AdminAccount = ReceivingAccount & { used: number };
type Channel = ReceivingAccount["channel"];
type Draft = { channel: Channel; bankName: string; accountName: string; accountNumber: string; qrUrl: string | null; enabled: boolean };

const EMPTY: Draft = { channel: "GCASH", bankName: "", accountName: "", accountNumber: "", qrUrl: null, enabled: true };

/**
 * Feasto's own GCash, Maya and bank accounts that residents can send a transfer to at checkout.
 * Only the admin sets them, so a resident never types (or is told) where the money goes. An
 * account residents already paid to can't be removed, only turned off, so the record stays true.
 */
export function ReceivingAccounts({ accounts }: { accounts: AdminAccount[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminAccount | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function open(account: AdminAccount | "new") {
    setErrors({});
    setDraft(account === "new" ? EMPTY : { channel: account.channel, bankName: account.bankName ?? "", accountName: account.accountName, accountNumber: account.accountNumber, qrUrl: account.qrUrl, enabled: account.enabled });
    setEditing(account);
  }

  async function save() {
    setBusy(true);
    const body = { ...draft, bankName: draft.channel === "BANK" ? draft.bankName : undefined };
    const result =
      editing === "new"
        ? await apiRequest("/admin/receiving-accounts", { method: "POST", body })
        : await apiRequest(`/admin/receiving-accounts/${(editing as AdminAccount).id}`, { method: "PUT", body });
    setBusy(false);
    if (!result.ok) {
      setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
      if (!result.fieldErrors) toast.error("Couldn't save the account", result.error);
      return;
    }
    toast.success(editing === "new" ? "Account added" : "Account saved", draft.enabled ? "Residents can send payments to it at checkout." : "It's off: residents don't see it.");
    setEditing(null);
    router.refresh();
  }

  async function toggle(a: AdminAccount) {
    const result = await apiRequest(`/admin/receiving-accounts/${a.id}`, {
      method: "PUT",
      body: { channel: a.channel, bankName: a.bankName ?? undefined, accountName: a.accountName, accountNumber: a.accountNumber, qrUrl: a.qrUrl, enabled: !a.enabled },
    });
    if (!result.ok) return toast.error("Couldn't change it", result.error);
    toast.success(a.enabled ? "Turned off" : "Turned on", a.enabled ? "Residents no longer see it at checkout." : "Residents can send payments to it at checkout.");
    router.refresh();
  }

  async function remove(a: AdminAccount) {
    const result = await apiRequest(`/admin/receiving-accounts/${a.id}`, { method: "DELETE" });
    if (!result.ok) return toast.error("Couldn't remove it", result.error);
    toast.success("Account removed");
    router.refresh();
  }

  const wallet = draft.channel !== "BANK";
  return (
    <Card
      title="Where residents send payments"
      description="Feasto's own GCash, Maya and bank accounts. Residents can pick one at checkout, send the money there, and you confirm it on the Transfers page before the store gets the order."
      Icon={Send}
      actions={
        <Button variant="secondary" onClick={() => open("new")}>
          <Plus className="size-[18px]" aria-hidden />
          Add an account
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No accounts yet. Until you add one, residents pay online only on Xendit&apos;s page (or in cash).</p>
      ) : (
        <ul className="grid gap-x-5 gap-y-6 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <li key={a.id} className="min-w-0">
              <AccountCard
                kind={a.channel}
                bank={a.bankName ?? undefined}
                number={a.accountNumber}
                name={a.accountName}
                caption={a.channel === "BANK" ? "Send to account number" : "Send to mobile number"}
                dimmed={!a.enabled}
                corner={a.qrUrl ? <QrCode className="size-6 text-white/85" aria-label="Has a QR code" /> : undefined}
              />
              <div className="mt-2.5 flex items-center gap-2 px-1">
                <p className="min-w-0 flex-1 leading-tight">
                  <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold ${a.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {a.enabled ? "On at checkout" : "Off"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{a.used ? `${a.used} ${a.used === 1 ? "payment" : "payments"}` : "No payments yet"}</span>
                </p>
                <Button variant="secondary" className="h-9 px-3 text-sm" onClick={() => void toggle(a)}>
                  {a.enabled ? "Turn off" : "Turn on"}
                </Button>
                <button type="button" onClick={() => open(a)} aria-label={`Edit ${a.label} ${a.shownNumber}`} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500">
                  <Pencil className="size-4" aria-hidden />
                </button>
                {a.used === 0 && (
                  <button type="button" onClick={() => void remove(a)} aria-label={`Remove ${a.label} ${a.shownNumber}`} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add an account" : "Edit the account"} description="Residents see exactly what you type here, so copy it from the app or the bank.">
        <div className="space-y-4">
          {/* What residents will see at checkout, filled in as it's typed */}
          <AccountCard
            kind={draft.channel}
            bank={draft.bankName}
            number={draft.accountNumber}
            name={draft.accountName}
            caption={wallet ? "Send to mobile number" : "Send to account number"}
            size="sm"
            dimmed={!draft.enabled}
            className="mx-auto max-w-xs"
          />
          <SegmentedControl
            name="channel"
            legend="Kind of account"
            value={draft.channel}
            onChange={(v) => set("channel", v)}
            options={[
              { value: "GCASH", label: "GCash", Icon: Wallet },
              { value: "MAYA", label: "Maya", Icon: Wallet },
              { value: "BANK", label: "Bank", Icon: Landmark },
            ]}
          />
          {!wallet && <TextField label="Bank" value={draft.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="BDO, BPI, Landbank…" error={errors.bankName} />}
          <TextField
            label={wallet ? `${draft.channel === "GCASH" ? "GCash" : "Maya"} number` : "Account number"}
            type={wallet ? "tel" : "text"}
            inputMode="numeric"
            value={draft.accountNumber}
            onChange={(e) => set("accountNumber", e.target.value)}
            placeholder={wallet ? "09171234567" : "10 to 16 digits"}
            error={errors.accountNumber}
          />
          <TextField label="Account name" value={draft.accountName} onChange={(e) => set("accountName", e.target.value)} hint="As the sender sees it, e.g. FEASTO NAVAL or J•••N D•••Z." error={errors.accountName} />
          <ImageUpload label={wallet ? "QR code (optional)" : "QR code, if your bank gives one (optional)"} value={draft.qrUrl} onChange={(url) => set("qrUrl", url)} shape="square" />
          <SwitchField label="Residents can pay to it" description="Turn off to hide it at checkout without removing it." checked={draft.enabled} onChange={(v) => set("enabled", v)} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
