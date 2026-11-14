import type { ReactNode } from "react";
import { PageTransition } from "@/components/app/page-transition";

/** Each new page fades in, or slides in from the side when a bottom tab was tapped (see PageTransition). */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
