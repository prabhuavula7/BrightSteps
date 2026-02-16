import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@brightsteps/content-schema", "@brightsteps/spaced-repetition"],
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
};

export default nextConfig;
