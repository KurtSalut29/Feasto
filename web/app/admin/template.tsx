import type { ReactNode } from "react";

/** Each new page fades in (see .fx-page in globals.css). */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="fx-page">{children}</div>;
}
