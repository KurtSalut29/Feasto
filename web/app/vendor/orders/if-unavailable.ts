import type { IfUnavailable } from "@/lib/types";

/**
 * What the customer chose at checkout for a dish that runs out, as the store reads it. Kept out of
 * ran-out-button.tsx: a server component importing a plain value from a "use client" file gets a
 * client reference instead of the object, and the words come out blank.
 */
export const IF_UNAVAILABLE_WORDS: Record<IfUnavailable, string> = {
  REMOVE: "take it off and send the rest",
  CALL: "call them first",
  CANCEL: "cancel the whole order",
};
