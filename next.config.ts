import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: [
    "@azure/identity",
    "@microsoft/microsoft-graph-client",
  ],
  images: {
    formats: ["image/webp"],
    minimumCacheTTL: 60,
    deviceSizes: [390, 640, 828, 1080, 1200, 1920],
    imageSizes: [200, 240, 480],
    qualities: [75, 85, 90, 95, 100],
  },
  async headers() {
    return ["/api/auth/:path*", "/api/students", "/api/profile/:path*", "/api/tutor/:path*", "/api/learning/:path*", "/api/cashfree/order", "/api/cashfree/refund", "/api/cashfree/installment"].map(source => ({
      source, headers: [{ key: "Cache-Control", value: "private, no-store" }],
    }));
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
};

export default nextConfig;
