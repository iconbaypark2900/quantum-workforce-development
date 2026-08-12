import type { NextConfig } from "next";

// `/api/*` is proxied at request time by `src/app/api/[[...path]]/route.ts` using
// `process.env.API_PROXY_TARGET` (Fly secrets, Vercel env, or web/.env.local).
// Do not use next.config rewrites for Flask — they are baked at `next build`.

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Static SPA in public/learn/navigator — beforeFiles so App Router /learn/*
    // does not 404 /learn/navigator before the HTML is served.
    return {
      beforeFiles: [
        {
          source: "/learn/navigator",
          destination: "/learn/navigator/index.html",
        },
        {
          source: "/learn/navigator/",
          destination: "/learn/navigator/index.html",
        },
      ],
    };
  },
};

export default nextConfig;
