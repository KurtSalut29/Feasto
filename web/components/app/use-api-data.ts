"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import { REFRESH_EVENT } from "./live-updates";

/**
 * Data from the API for a URL that changes as the person uses the page (e.g. the part of
 * the map on screen). Keeps showing the last answer while the next one loads, and ignores
 * an answer that arrives after the URL has moved on. Change `refreshKey` to load again; it also
 * loads again by itself whenever the page's data is refreshed in the background (LiveUpdates).
 */
export function useApiData<T>(url: string | null, refreshKey: unknown = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [background, setBackground] = useState(0);
  /** What was asked for last: a background reload of the same thing shows no loading state */
  const asked = useRef<string | null>(null);
  useEffect(() => {
    const again = () => setBackground((n) => n + 1);
    window.addEventListener(REFRESH_EVENT, again);
    return () => window.removeEventListener(REFRESH_EVENT, again);
  }, []);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const key = `${url} ${String(refreshKey)}`;
    const quiet = asked.current === key;
    asked.current = key;
    if (!quiet) setLoading(true); // the loading flag starts with the request
    void apiRequest<T>(url).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [url, refreshKey, background]);
  return { data, loading };
}
