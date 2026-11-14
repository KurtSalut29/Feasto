import { ViewTransition, type ReactNode } from "react";

/** Going to sign-up slides forward, back to login slides back; anything else fades (CSS in globals.css) */
const SWAP = { "auth-forward": "auth-forward", "auth-back": "auth-back", default: "auth-fade" };

/**
 * The card's content between Log in and Create account: the old content slides out and fades while
 * the card grows or shrinks to the new content's size, then the new content slides in.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SWAP} exit={SWAP} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
