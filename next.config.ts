import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Prevent ESLint from failing production build on Vercel; run lint in CI instead.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
