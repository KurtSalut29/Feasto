import type { Metadata } from "next";
import { ProblemScreen } from "@/components/app/problem-screen";
import { ButtonLink } from "@/components/ui/button";
import { BackLink } from "./problem-actions";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <ProblemScreen
      code="page not found"
      title="We couldn't find that page"
      actions={
        <>
          <ButtonLink href="/">Go to my home page</ButtonLink>
          <BackLink />
        </>
      }
    >
      The link may be old, or the order, store or dish it pointed to was removed. Check the address, or start again from your home page.
    </ProblemScreen>
  );
}
