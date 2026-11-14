"use client";

import { createContext, use, useEffect, useState, ViewTransition, type ReactNode } from "react";
import { StoreCover } from "./store-card";

const Tapped = createContext(false);

/**
 * The store card tapped last, so the store page's loading screen can already show its photo where
 * the logo will be: the store page loads after the tap, and a photo can only grow into something
 * that's on screen. Forgotten after a few seconds, or once the store page has loaded.
 */
let lastTap: { storeId: string; imageUrl: string | null } | null = null;
const TAP_LASTS_MS = 5000;

/**
 * A store card whose photo grows into the store page's logo when it's tapped (a view transition,
 * CSS in globals.css). Only the tapped card's photo gets the store's name, so a store shown twice
 * on one page (Near you and Top rated) never has two photos claiming to be it.
 */
export function MorphCard({ storeId, imageUrl, className, children }: { storeId: string; imageUrl: string | null; className: string; children: ReactNode }) {
  const [tapped, setTapped] = useState(false);
  return (
    <Tapped value={tapped}>
      {/* Capture phase: named before the link starts the navigation */}
      <article
        className={className}
        onClickCapture={() => {
          const tap = { storeId, imageUrl };
          lastTap = tap;
          setTimeout(() => {
            if (lastTap === tap) lastTap = null;
          }, TAP_LASTS_MS);
          setTapped(true);
        }}
      >
        {children}
      </article>
    </Tapped>
  );
}

const photoName = (storeId: string) => `store-photo-${storeId}`;

/** The photo in a MorphCard, or the logo on the store page (always named there). */
export function MorphPhoto({ storeId, always, children }: { storeId: string; always?: boolean; children: ReactNode }) {
  const tapped = use(Tapped);
  useEffect(() => {
    if (always) lastTap = null;
  }, [always]);
  return (
    <ViewTransition name={tapped || always ? photoName(storeId) : undefined} share="fx-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * The store page while it loads. Right after a store card was tapped, it's the top of the store
 * page with the tapped photo already in the logo's place, so the photo grows straight into it;
 * otherwise the usual skeleton.
 */
export function StoreLoading({ fallback }: { fallback: ReactNode }) {
  const tap = lastTap;
  if (!tap) return fallback;
  return (
    <div aria-busy="true">
      <div className="relative -mx-4 -mt-5 px-4 pt-7">
        <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-brand-50 to-white" />
        <ViewTransition name={photoName(tap.storeId)} share="fx-morph" default="none">
          <StoreCover imageUrl={tap.imageUrl} eager className="mx-auto size-28 rounded-full shadow-[0_10px_24px_-12px_rgba(178,58,0,0.55)] ring-4 ring-white" />
        </ViewTransition>
      </div>
      <div className="mx-auto mt-4 h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
      <div className="mx-auto mt-2 h-4 w-40 animate-pulse rounded-lg bg-gray-200" />
      <div className="mt-6 h-16 animate-pulse rounded-2xl bg-gray-200" />
      <div className="mt-4 h-28 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
