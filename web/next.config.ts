import type { NextConfig } from "next";

// The browser calls /api/v1 on the web origin; Next proxies it to the API (no CORS needed).
const apiUrl = process.env.API_URL ?? "http://api:2478";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
