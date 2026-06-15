/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages consumed by the web app (compiled ESM in their dist/).
  transpilePackages: [
    "@signalguard/auth",
    "@signalguard/audit",
    "@signalguard/broker-adapters",
    "@signalguard/config",
    "@signalguard/database",
  ],
  experimental: {
    // Prisma ships a native query engine — keep it external rather than bundled.
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
