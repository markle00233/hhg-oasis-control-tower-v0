import type { NextConfig } from "next";

const isAdminAllplace =
  process.env.NEXT_PUBLIC_APP_SURFACE === "adminAllplace";

const nextConfig: NextConfig = {
  async redirects() {
    if (isAdminAllplace) {
      return [
        { source: "/", destination: "/desk", permanent: false },
        { source: "/index.html", destination: "/desk", permanent: false },
      ];
    }
    return [
      {
        source: "/",
        destination: "/index.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
