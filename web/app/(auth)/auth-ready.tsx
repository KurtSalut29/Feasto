"use client";

import { useEffect } from "react";

/** How long the opening animation takes (the last line rises at 0.95s for 0.7s) */
const OPENING_MS = 1800;

/**
 * Marks the opening animation as over (html[data-auth-ready], globals.css), so the card's lines
 * don't rise in again when switching between Log in and Create account.
 */
export function AuthReady() {
  useEffect(() => {
    const timer = setTimeout(() => document.documentElement.setAttribute("data-auth-ready", ""), OPENING_MS);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
