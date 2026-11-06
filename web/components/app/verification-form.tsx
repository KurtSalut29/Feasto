"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { PERMIT_FIELDS, RIDER_LICENSE_FIELDS, RIDER_PERSONAL_FIELDS, STORE_CODE_FIELD, type Verification } from "@/lib/verification-fields";
import { DocumentPreview } from "./document-preview";
import { DocumentPicker, uploadDocument } from "./document-upload";

/**
 * Lets a store or rider fix their details and document while they wait, or after a rejection.
 * Saving after a rejection sends the application back to whoever reviews it.
 */
export function VerificationForm({ role, data }: { role: "VENDOR" | "RIDER"; data: Verification }) {
  const router = useRouter();
  const isStore = role === "VENDOR";
  const fields = isStore ? PERMIT_FIELDS : [...RIDER_PERSONAL_FIELDS, ...RIDER_LICENSE_FIELDS, STORE_CODE_FIELD];
  const documentName = isStore ? "Business permit" : "Driver's license";
  const [values, setValues] = useState(data.fields);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setSaved(false);
    setFieldErrors({});
    try {
      if (file) await uploadDocument(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try another file.");
      setSaving(false);
      return;
    }
    const result = await apiRequest("/documents/verification", { method: "PATCH", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setFile(null);
    setSaved(true);
    router.refresh();
  }

  const href = `/api/documents/${isStore ? "store" : "rider"}/${data.id}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <h2 className="font-semibold text-ink">{data.status === "REJECTED" ? "Fix your application" : "Your application"}</h2>
        <p className="text-sm text-muted">
          {data.document ? `You can still change these details and your ${documentName.toLowerCase()} until they're reviewed.` : `Upload your ${documentName.toLowerCase()} so your application can be reviewed.`}
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && !error && <Alert tone="success">Saved.</Alert>}
      <DocumentPreview href={href} kind={data.document} label={documentName} />
      <DocumentPicker
        label={data.document ? `Replace ${documentName.toLowerCase()}` : `Upload ${documentName.toLowerCase()}`}
        hint="JPG, PNG or PDF, up to 5 MB. All the text must be readable."
        file={file}
        onChange={setFile}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(({ name, label, type, placeholder, Icon, hint, uppercase }) => (
          <TextField
            key={name}
            label={label}
            name={name}
            type={type ?? "text"}
            value={values[name] ?? ""}
            placeholder={placeholder}
            icon={Icon}
            hint={hint}
            autoCapitalize={uppercase ? "characters" : undefined}
            error={fieldErrors[name]?.[0]}
            onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
          />
        ))}
      </div>
      <Button type="submit" loading={saving} className="w-full">
        {data.status === "REJECTED" ? "Submit again" : "Save changes"}
      </Button>
    </form>
  );
}
