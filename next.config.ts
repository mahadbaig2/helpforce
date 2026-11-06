import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge covers the Sign out button.
  devIndicators: false,
  experimental: {
    agentFeedback: true,
  },
};

export default nextConfig;
