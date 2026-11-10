"use client";

import { useEffect } from "react";
import { ProblemScreen } from "@/components/app/problem-screen";
import { Button, ButtonLink } from "@/components/ui/button";

/** A page that couldn't load (e.g. Feasto's servers were restarting). */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <ProblemScreen
      code={error.digest ? `error ${error.digest}` : "page error"}
      title={offline ? "You're offline" : "This page didn't load"}
      actions={
        <>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Go to my home page
          </ButtonLink>
        </>
      }
    >
      {offline
        ? "Feasto needs the internet to show this page. Check your Wi-Fi or mobile data, then try again."
        : "Feasto couldn't get what this page needs right now. Nothing you did was lost. Try again in a moment."}
    </ProblemScreen>
  );
}
