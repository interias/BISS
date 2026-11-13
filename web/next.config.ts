import type { NextConfig } from "next";

// The browser calls /api/v1 on the web origin; Next proxies it to the API (no CORS needed).
const apiUrl = process.env.API_URL ?? "http://api:2478";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The rewrite below gives up after 30 s by default. A label or plate photo may take
    // two model calls of up to 90 s each (app/labels/agent.py), so it waits longer.
    proxyTimeout: 200_000,
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
