"use client";

import { useState } from "react";
import { PrivacyPolicy, TermsOfService, TERMS_UPDATED } from "@/components/app/legal";
import { Dialog } from "@/components/ui/dialog";

export type Doc = "terms" | "privacy";

const DOCS = {
  terms: { title: "Terms of Service", Body: TermsOfService },
  privacy: { title: "Privacy Policy", Body: PrivacyPolicy },
} as const;

/** The Terms or the Privacy Policy in a pop-up */
export function LegalDialog({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  // Keeps showing the last one while the pop-up closes
  const [shown, setShown] = useState<Doc>(doc ?? "terms");
  if (doc && doc !== shown) setShown(doc);
  const { title, Body } = DOCS[shown];
  return (
    <Dialog open={doc !== null} onClose={onClose} title={title} description={`Last updated ${TERMS_UPDATED}.`} wide>
      <Body inPopup />
    </Dialog>
  );
}

/** Opens the Terms or the Privacy Policy in a pop-up, so the sign-up form keeps what was typed. */
export function LegalButton({ doc, className, children }: { doc: Doc; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { title, Body } = DOCS[doc];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? title}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={`Last updated ${TERMS_UPDATED}.`} wide>
        <Body inPopup />
      </Dialog>
    </>
  );
}

const link = "rounded font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500";

/** "Terms · Privacy" under the login and sign-up cards */
export function LegalLinks() {
  return (
    <>
      <LegalButton doc="terms" className={link}>
        Terms
      </LegalButton>
      <LegalButton doc="privacy" className={link}>
        Privacy
      </LegalButton>
    </>
  );
}
