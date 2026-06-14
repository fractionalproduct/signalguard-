/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@signalguard/auth",
    "@signalguard/audit",
    "@signalguard/config",
    "@signalguard/database",
  ],
  experimental: {
    // Prisma ships a native query engine — keep it external rather than bundled.
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
