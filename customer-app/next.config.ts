import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["qrcode", "html5-qrcode"],
  },
  images: {
    unoptimized: true, // QR data URLs / static PNGs — skip optimizer latency
  },
};

export default nextConfig;
