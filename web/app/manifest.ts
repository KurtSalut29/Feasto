import type { MetadataRoute } from "next";

/**
 * Makes Feasto installable on phones ("Add to Home Screen"). The installed app opens full
 * screen at "/", which sends each user to their own area: residents to stores, riders to jobs.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Feasto",
    short_name: "Feasto",
    description: "Order food and book tables from every vendor in your community.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["food", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
