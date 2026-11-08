"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" keeps a copy. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-[18px]" aria-hidden />
      Print or save
    </Button>
  );
}
