"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/browser-api";

/**
 * Data from the API for a URL that changes as the person uses the page (e.g. the part of
 * the map on screen). Keeps showing the last answer while the next one loads, and ignores
 * an answer that arrives after the URL has moved on. Change `refreshKey` to load again.
 */
export function useApiData<T>(url: string | null, refreshKey: unknown = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag starts with the request
    setLoading(true);
    void apiRequest<T>(url).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);
  return { data, loading };
}
