import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image (web/Dockerfile) runs a self-contained server; local `next start` is unchanged
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  // The floating "N" dev button covered the mobile tab bar. Errors still show without it.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Phones open the dev server through an HTTPS tunnel (npm run tunnel); allow its address
  allowedDevOrigins: ["*.trycloudflare.com"],
  // The service worker must never be served from a cache, or phones would keep an old copy
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  // The browser only talks to this Next.js app. Requests to /api/* are forwarded to the
  // Nginx load balancer, so the login cookie stays on this site and no CORS setup is needed.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:8080";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
