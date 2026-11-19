"use client";

import { Hourglass, IdCard, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentPicker, uploadDocument } from "@/components/app/document-upload";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { ID_TYPE_OPTIONS, idTypeLabel } from "@/lib/identity";
import type { User } from "@/lib/types";

/**
 * The resident's valid ID on Home: a note while the admin checks it, and the way to send one when
 * there's none yet (an account from before IDs were asked, or an upload that failed) or the admin
 * couldn't accept it. Nothing once it's verified.
 */
export function IdNotice({ user }: { user: Pick<User, "idStatus" | "idReviewNote" | "idType" | "name"> }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [idType, setIdType] = useState(user.idType ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (user.idStatus === "VERIFIED") return null;
  if (user.idStatus === "PENDING") {
    return (
      <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        <span>
          Feasto is checking your <span className="font-semibold text-ink">{idTypeLabel(user.idType)}</span>. You can order in the meantime.
        </span>
      </p>
    );
  }

  const rejected = user.idStatus === "REJECTED";
  async function send() {
    if (!idType) return setError("Choose the kind of ID.");
    if (!file) return setError("Take or upload a photo of your ID.");
    setBusy(true);
    setError(undefined);
    try {
      if (idType !== user.idType) {
        const saved = await apiRequest("/me/id-type", { method: "PUT", body: { idType } });
        if (!saved.ok) throw new Error(saved.error);
      }
      await uploadDocument(file);
      toast.success("ID sent", "The admin will check it soon.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="id-notice"
      className={`mt-4 rounded-2xl border p-4 ${rejected ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70"}`}
    >
      <h2 id="id-notice" className={`flex items-center gap-2 font-semibold ${rejected ? "text-red-800" : "text-amber-900"}`}>
        {rejected ? <TriangleAlert className="size-5 shrink-0" aria-hidden /> : <IdCard className="size-5 shrink-0" aria-hidden />}
        {rejected ? "We couldn't verify your ID" : "Add your valid ID"}
      </h2>
      <p className={`mt-1 text-sm ${rejected ? "text-red-800" : "text-amber-900"}`}>
        {rejected
          ? `${user.idReviewNote ?? "The photo couldn't be checked."} Send a clear photo of a valid ID with the name ${user.name}.`
          : `So stores and riders know who they're serving. The name on it must be ${user.name}. Only Feasto's admin sees it.`}
      </p>
      <div className="mt-3 space-y-3">
        <SelectField label="Kind of ID" placeholder="Choose your ID" options={ID_TYPE_OPTIONS} value={idType} onChange={(e) => setIdType(e.target.value)} />
        <DocumentPicker label="Photo of your ID" hint="The front, with your name and photo readable." file={file} camera onChange={setFile} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" loading={busy} onClick={send}>
          Send my ID
        </Button>
      </div>
    </section>
  );
}
