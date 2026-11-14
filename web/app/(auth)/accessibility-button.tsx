"use client";

import { useState } from "react";
import { AccessibilityStatement } from "@/components/app/accessibility-statement";
import { Dialog } from "@/components/ui/dialog";

/** "Accessibility" under the login and sign-up cards: the statement opens in a pop-up, so the form keeps what was typed. */
export function AccessibilityButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        Accessibility
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="How Feasto is made accessible"
        description="Feasto is made to be used by everyone: residents, riders, store owners and the admin, on all kinds of phones, eyes and hands."
        wide
      >
        <AccessibilityStatement inPopup signedOut />
      </Dialog>
    </>
  );
}
