"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";

/** Explains the sudden logout when an admin disabled the account. */
export function DisabledNotice() {
  if (useSearchParams().get("reason") !== "disabled") return null;
  return (
    <div className="mt-4">
      <Alert tone="error">Your account has been disabled by a Feasto admin, so you were logged out.</Alert>
    </div>
  );
}
