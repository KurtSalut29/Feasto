"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id?: string) => void };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileOn = Boolean(SITE_KEY);

/**
 * Cloudflare Turnstile, the bot check on sign-up and login (no puzzle for people). Renders nothing
 * when Feasto was built without a site key, and the server doesn't ask for a token then either.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const id = useId();
  const keep = useRef(onToken);
  useEffect(() => {
    keep.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let stopped = false;
    const draw = () => {
      if (stopped || !box.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => keep.current(token),
        "expired-callback": () => keep.current(null),
        "error-callback": () => keep.current(null),
        appearance: "interaction-only",
      });
    };
    const timer = setInterval(draw, 300);
    draw();
    return () => {
      stopped = true;
      clearInterval(timer);
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={box} id={`turnstile-${id}`} />
    </>
  );
}
