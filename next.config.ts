import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: [
    "@azure/identity",
    "@microsoft/microsoft-graph-client",
    "open",
    "powershell-utils",
    "wsl-utils",
  ],
  images: {
    formats: ["image/webp"],
    minimumCacheTTL: 60,
    deviceSizes: [390, 640, 828, 1080, 1200, 1920],
    imageSizes: [200, 240, 480],
    qualities: [75, 85, 90, 95, 100],
  },
  async redirects() {
    return [
      {
        source: "/auth/login",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/auth/signup",
        destination: "/signup",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://172.169.233.17:8000";
    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
