/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages consumed by the web app (compiled ESM in their dist/).
  transpilePackages: ["@signalguard/broker-adapters"],
};

export default nextConfig;
