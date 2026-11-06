"use client";

import { CalendarDays, FileBadge, IdCard, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { daysLeft, formatDate } from "@/lib/format";
import type { RenewalInfo } from "@/lib/verification-fields";
import { DocumentPreview } from "./document-preview";
import { DocumentPicker, uploadDocument } from "./document-upload";

/** Below this many days the renewal form opens by itself, like the reminders that link here. */
const OPEN_FORM_DAYS = 30;

/**
 * An approved store's permit or rider's license: what's on file, and how to send a renewed one.
 * The old document stays in use until the reviewer approves the new one.
 */
export function RenewalPanel({ data }: { data: RenewalInfo }) {
  const router = useRouter();
  const isPermit = data.kind === "permit";
  const documentName = isPermit ? "Business permit" : "Driver's license";
  const lowerName = documentName.toLowerCase();
  const pending = data.renewal?.status === "PENDING";
  const rejected = data.renewal?.status === "REJECTED";
  const left = data.expiresAt ? daysLeft(data.expiresAt) : null;

  const [opened, setOpened] = useState(false);
  const [number, setNumber] = useState(data.number ?? "");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [fileError, setFileError] = useState<string>();
  const panel = useRef<HTMLElement>(null);

  // The reminders link straight here, but this part of the page arrives after the browser looks for it
  useEffect(() => {
    if (window.location.hash === "#permit") panel.current?.scrollIntoView();
  }, []);

  const formVisible = !pending && data.canRenew && (opened || rejected || data.expired || (left !== null && left <= OPEN_FORM_DAYS));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setFieldErrors({});
    setFileError(undefined);
    if (!file) {
      setFileError(`Choose a photo or PDF of your renewed ${lowerName}.`);
      return;
    }
    setSaving(true);
    try {
      await uploadDocument(file, "/api/documents/renewal/file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try another file.");
      setSaving(false);
      return;
    }
    const result = await apiRequest("/documents/renewal", { method: "POST", body: { number, expiresAt } });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setFile(null);
    setOpened(false);
    router.refresh();
  }

  return (
    <section ref={panel} id="permit" className="scroll-mt-6 space-y-3 rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">{documentName}</h2>
          <p className="text-sm text-muted">{data.number ?? "No number on file"}</p>
        </div>
        {data.expiresAt &&
          (data.expired ? (
            <Badge tone="danger" dot>
              Expired {formatDate(data.expiresAt)}
            </Badge>
          ) : (
            <Badge tone={left !== null && left <= OPEN_FORM_DAYS ? "warning" : "success"} dot>
              Valid until {formatDate(data.expiresAt)}
            </Badge>
          ))}
      </div>

      <DocumentPreview href={`/api/documents/${isPermit ? "store" : "rider"}/${data.id}`} kind={data.document} label={documentName} />

      {pending && data.renewal && (
        <Alert tone="pending" title="Your renewal is being checked">
          {data.reviewerName === "the Feasto admin" ? "The Feasto admin" : data.reviewerName} is reviewing it. It&apos;s valid until {formatDate(data.renewal.expiresAt!)} once approved.
        </Alert>
      )}
      {pending && data.renewal && <DocumentPreview href={`/api/documents/renewal/${data.renewal.id}/file`} kind={data.renewal.document} label={`Renewed ${lowerName}`} />}
      {rejected && data.renewal && (
        <Alert tone="error" title="Your renewal wasn't approved">
          Reason: {data.renewal.note} Fix this and send it again.
        </Alert>
      )}
      {!data.canRenew && (
        <p className="text-sm text-muted">You can renew this once your application is approved.</p>
      )}

      {formVisible ? (
        <form onSubmit={submit} noValidate className="space-y-3 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink">Send your renewed {lowerName}</p>
          {error && <Alert tone="error">{error}</Alert>}
          <DocumentPicker label={`Renewed ${lowerName}`} hint="JPG, PNG or PDF, up to 5 MB. All the text must be readable." file={file} onChange={setFile} error={fileError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={isPermit ? "Business permit number" : "Driver's license number"}
              name="number"
              value={number}
              icon={isPermit ? FileBadge : IdCard}
              autoCapitalize="characters"
              error={fieldErrors.number?.[0]}
              onChange={(event) => setNumber(event.target.value)}
            />
            <TextField
              label="New expiry date"
              name="expiresAt"
              type="date"
              value={expiresAt}
              icon={CalendarDays}
              error={fieldErrors.expiresAt?.[0]}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </div>
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Send for review
          </Button>
        </form>
      ) : (
        !pending &&
        data.canRenew && (
          <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setOpened(true)}>
            <Upload className="size-4" aria-hidden />
            Upload a renewed {isPermit ? "permit" : "license"}
          </Button>
        )
      )}
    </section>
  );
}
