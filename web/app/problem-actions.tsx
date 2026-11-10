"use client";

import { Button } from "@/components/ui/button";

/** Back to the page they came from */
export function BackLink() {
  return (
    <Button type="button" variant="secondary" onClick={() => history.back()}>
      Go back
    </Button>
  );
}
