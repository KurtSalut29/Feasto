"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";

const NOTICES = {
  disabled: <Alert tone="error">Your account has been disabled by a Feasto admin, so you were logged out.</Alert>,
  password: <Alert tone="info">Your password was changed on another device, so you were logged out. Log in with the new password.</Alert>,
};

/** Explains a sudden logout: an admin disabled the account, or its password was changed elsewhere. */
export function LogoutNotice() {
  const reason = useSearchParams().get("reason");
  if (reason !== "disabled" && reason !== "password") return null;
  return <div className="mt-4">{NOTICES[reason]}</div>;
}
