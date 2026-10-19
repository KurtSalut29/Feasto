import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only talks to this Next.js app. Requests to /api/* are forwarded to the
  // Nginx load balancer, so the login cookie stays on this site and no CORS setup is needed.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:8080"}/api/:path*` }];
  },
};

export default nextConfig;
