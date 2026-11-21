"use client";

import { CircleAlert, CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { idTypeLabel } from "@/lib/identity";
import { documentBody } from "./document-upload";

/**
 * The photo of an ID, license or permit checked as soon as it's picked, while the person can still
 * fix it: a selfie, a sample picture from the internet, a blurry photo, or a driver's license sent
 * as "PhilSys ID" is caught here instead of days later by the admin. The admin still decides.
 *
 * When Feasto has no automatic check set up, nothing shows and nothing is held back.
 */

export type DocumentCheckRequest = {
  kind: "RESIDENT_ID" | "LICENSE" | "PERMIT";
  /** The kind of ID chosen (residents) */
  idType?: string;
  /** Before the account exists: the email just confirmed with its code */
  email?: string;
  /** The name that should be on it, as typed on the form */
  name?: string;
  /** The license or permit number typed on the form */
  number?: string;
};

type Result = {
  verdict: "LOOKS_REAL" | "REVIEW" | "NOT_A_DOCUMENT" | "NOT_CHECKED";
  block: string | null;
  warnings: string[];
  seenAs: string | null;
  suggestIdType: string | null;
};

export type DocumentCheck = {
  state: { status: "idle" } | { status: "checking" } | { status: "done"; result: Result } | { status: "unavailable" };
  /** How many different photos were turned back: after two, "send it anyway" is offered */
  turnedBack: number;
  sendAnyway: boolean;
  chooseSendAnyway: () => void;
};

// A number for each picked file, so a new photo (even with the same name) is checked again
const fileIds = new WeakMap<File, number>();
let nextFileId = 1;
function idOf(file: File) {
  let id = fileIds.get(file);
  if (!id) {
    id = nextFileId++;
    fileIds.set(file, id);
  }
  return id;
}

/** Checks `file` against `request`; again when either changes (a changed name or number is re-judged without reading the photo again) */
export function useDocumentCheck(file: File | null, request: DocumentCheckRequest | null): DocumentCheck {
  const fileId = file ? idOf(file) : null;
  const key = fileId && request ? `${fileId}|${JSON.stringify(request)}` : null;
  const [answer, setAnswer] = useState<{ key: string; result: Result | null } | null>(null);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [anywayFor, setAnywayFor] = useState<number | null>(null);

  useEffect(() => {
    if (!file || !key || !fileId) return;
    const req = JSON.parse(key.slice(key.indexOf("|") + 1)) as DocumentCheckRequest;
    const controller = new AbortController();
    // Typing a name or number waits for a pause before checking
    const timer = setTimeout(async () => {
      try {
        const body = await documentBody(file);
        const headers: Record<string, string> = { "Content-Type": file.type === "application/pdf" ? "application/pdf" : "image/jpeg", "X-Document-Kind": req.kind };
        if (req.idType) headers["X-Id-Type"] = req.idType;
        if (req.email) headers["X-Email"] = encodeURIComponent(req.email);
        if (req.name) headers["X-Expected-Name"] = encodeURIComponent(req.name);
        if (req.number) headers["X-Document-Number"] = encodeURIComponent(req.number);
        const response = await fetch(req.email ? "/api/auth/document-check" : "/api/documents/check", { method: "POST", headers, body, signal: controller.signal });
        const result = response.ok ? ((await response.json()) as Result) : null;
        setAnswer({ key, result });
        if (result?.block) setBlocked((list) => (list.includes(fileId) ? list : [...list, fileId]));
      } catch {
        if (!controller.signal.aborted) setAnswer({ key, result: null });
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [file, fileId, key]);

  const state: DocumentCheck["state"] = !key ? { status: "idle" } : answer?.key !== key ? { status: "checking" } : answer.result ? { status: "done", result: answer.result } : { status: "unavailable" };
  return {
    state,
    turnedBack: blocked.length,
    sendAnyway: fileId !== null && anywayFor === fileId,
    chooseSendAnyway: () => setAnywayFor(fileId),
  };
}

/** Why the form can't go on yet because of the photo, or null */
export function documentCheckProblem(check: DocumentCheck): string | null {
  if (check.state.status === "checking") return "Wait a moment: the photo is still being checked.";
  if (check.state.status === "done" && check.state.result.block && !check.sendAnyway) return check.state.result.block;
  return null;
}

const a = (words: string) => (/^([aeio]|SSS)/i.test(words) ? `an ${words}` : `a ${words}`);

/** What the check found, under the photo picker */
export function DocumentCheckNote({
  check,
  what,
  flagged = false,
  onUseIdType,
}: {
  check: DocumentCheck;
  /** "ID", "driver's license", "business permit" */
  what: string;
  /** The form was sent while this still needs fixing: stand out */
  flagged?: boolean;
  /** Switch "Kind of ID" to what the photo really is */
  onUseIdType?: (idType: string) => void;
}) {
  const { state } = check;
  if (state.status === "checking") {
    return (
      <p role="status" className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted ${flagged ? "bg-canvas ring-1 ring-line" : ""}`}>
        <LoaderCircle className="size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
        {flagged ? "Still checking the photo. Wait a moment, then continue." : "Checking the photo… this takes a few seconds."}
      </p>
    );
  }
  if (state.status !== "done" || state.result.verdict === "NOT_CHECKED") return null;
  const { block, warnings, seenAs, suggestIdType } = state.result;

  if (block && !check.sendAnyway) {
    return (
      <div role="alert" className={`mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 ${flagged ? "ring-2 ring-red-300" : ""}`}>
        <p className="flex gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{block}</span>
        </p>
        {(suggestIdType && onUseIdType) || check.turnedBack >= 2 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
            {suggestIdType && onUseIdType && (
              <button type="button" onClick={() => onUseIdType(suggestIdType)} className="font-semibold text-red-900 underline underline-offset-2 hover:no-underline">
                Change to {idTypeLabel(suggestIdType)}
              </button>
            )}
            {check.turnedBack >= 2 && (
              <button type="button" onClick={check.chooseSendAnyway} className="font-semibold text-red-900 underline underline-offset-2 hover:no-underline">
                It&apos;s really my {what}: send it anyway
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (block) {
    return (
      <p role="status" className="mt-2 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>You&apos;re sending it anyway. The admin will look at it closely before accepting it.</span>
      </p>
    );
  }

  if (warnings.length > 0) {
    return (
      <div role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <p className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{seenAs ? `Looks like ${a(seenAs)}, but:` : "Worth a second look:"}</span>
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-10">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="mt-1 pl-6 text-xs">You can still send it. The admin checks these.</p>
      </div>
    );
  }

  return (
    <p role="status" className="mt-2 flex items-center gap-2 text-sm text-emerald-800">
      <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
      {seenAs ? `Looks like ${a(seenAs)}. The admin will confirm it.` : "The photo looks fine. The admin will confirm it."}
    </p>
  );
}
